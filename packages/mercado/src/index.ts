/**
 * ============================================================================
 *  opencode-plugin-mercado — Cotações, spread e orderbook (cripto)
 * ============================================================================
 *
 *  Plugin do opencode voltado a robôs HFT/trading. Fornece tools para o agente
 *  consultar dados de mercado e fazer cálculos de microestrutura.
 *
 *  Tools:
 *   - spread_bps          → cálculo puro: bid/ask → spread e half-spread em bps
 *   - cotacao_binance     → ticker 24h da Binance (REST público)
 *   - orderbook_binance   → book L2 da Binance: best bid/ask, spread, imbalance
 *
 *  Hook:
 *   - chat.params         → temperatura baixa (decisão de trading = precisão)
 *
 *  Compila para dist/ (ESM). Roda em Node e em Bun. Usa `fetch` global (Node 18+).
 * ============================================================================
 */

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

// Base pública da Binance spot. Configurável por opção do plugin (2º argumento).
const DEFAULT_BASE = "https://api.binance.com"

export const MercadoPlugin: Plugin = async (_ctx, options) => {
  const base = typeof options?.base === "string" ? options.base : DEFAULT_BASE

  const num = (v: string | number, casas = 2) =>
    Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })

  // Wrapper de fetch com timeout e erro legível (nunca lança: retorna string de erro
  // para o modelo em vez de derrubar a execução da tool).
  const getJson = async (url: string): Promise<{ ok: true; data: any } | { ok: false; erro: string }> => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) return { ok: false, erro: `HTTP ${res.status} ${res.statusText}` }
      return { ok: true, data: await res.json() }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    } finally {
      clearTimeout(t)
    }
  }

  return {
    tool: {
      /**
       * Spread e half-spread em bps a partir de bid/ask. Cálculo puro (offline).
       * half-spread é a métrica central do robô maker ([[hft-estrategia-edge-rebate]]).
       */
      spread_bps: tool({
        description:
          "Calcula spread absoluto, spread em bps, half-spread em bps e o mid a partir do melhor " +
          "bid e ask. Útil para avaliar viabilidade de market making (fee vs spread).",
        args: {
          bid: tool.schema.number().positive().describe("Melhor preço de compra (best bid)"),
          ask: tool.schema.number().positive().describe("Melhor preço de venda (best ask)"),
        },
        async execute(args) {
          if (args.ask <= args.bid) {
            return { output: `Book cruzado/inválido: ask (${args.ask}) <= bid (${args.bid}).` }
          }
          const mid = (args.bid + args.ask) / 2
          const spreadAbs = args.ask - args.bid
          const spreadBps = (spreadAbs / mid) * 10000
          const halfBps = spreadBps / 2
          return {
            title: `spread ${spreadBps.toFixed(2)} bps`,
            output: [
              `mid: ${num(mid, 6)}`,
              `spread absoluto: ${num(spreadAbs, 6)}`,
              `spread: ${spreadBps.toFixed(2)} bps`,
              `half-spread: ${halfBps.toFixed(2)} bps`,
            ].join("\n"),
            metadata: { mid, spreadAbs, spreadBps, halfBps },
          }
        },
      }),

      /**
       * Ticker 24h da Binance spot (REST público).
       */
      cotacao_binance: tool({
        description:
          "Consulta o ticker de 24h de um par na Binance spot (preço, variação %, máx/mín, volume). " +
          "Símbolo no formato BASEQUOTE, ex: BTCUSDT, XRPUSDT.",
        args: {
          symbol: tool.schema.string().default("BTCUSDT").describe("Par, ex: BTCUSDT"),
        },
        async execute(args) {
          const symbol = (args.symbol ?? "BTCUSDT").toUpperCase()
          const r = await getJson(`${base}/api/v3/ticker/24hr?symbol=${symbol}`)
          if (!r.ok) return { output: `Erro ao consultar Binance (${symbol}): ${r.erro}` }
          const d = r.data
          return {
            title: `${symbol} ${num(d.lastPrice)} (${num(d.priceChangePercent)}%)`,
            output: [
              `Par: ${symbol}`,
              `Último: ${num(d.lastPrice)}`,
              `Variação 24h: ${num(d.priceChangePercent)}%`,
              `Máx/Mín 24h: ${num(d.highPrice)} / ${num(d.lowPrice)}`,
              `Volume 24h: ${num(d.volume, 0)} (${num(d.quoteVolume, 0)} quote)`,
            ].join("\n"),
            metadata: { symbol, last: Number(d.lastPrice), changePct: Number(d.priceChangePercent) },
          }
        },
      }),

      /**
       * Book L2 da Binance: best bid/ask, spread em bps, mid e imbalance dos top N níveis.
       */
      orderbook_binance: tool({
        description:
          "Consulta o livro de ofertas (L2) de um par na Binance spot e calcula best bid/ask, spread " +
          "em bps, mid e o order-book imbalance dos primeiros níveis (0..1, >0,5 = pressão compradora).",
        args: {
          symbol: tool.schema.string().default("BTCUSDT").describe("Par, ex: BTCUSDT"),
          limit: tool.schema.number().int().min(5).max(100).default(20).describe("Profundidade a buscar"),
          niveis: tool.schema.number().int().min(1).max(50).default(5).describe("Níveis usados no imbalance"),
        },
        async execute(args) {
          const symbol = (args.symbol ?? "BTCUSDT").toUpperCase()
          const limit = args.limit ?? 20
          const niveis = args.niveis ?? 5
          const r = await getJson(`${base}/api/v3/depth?symbol=${symbol}&limit=${limit}`)
          if (!r.ok) return { output: `Erro ao consultar book (${symbol}): ${r.erro}` }

          const bids: [string, string][] = r.data.bids ?? []
          const asks: [string, string][] = r.data.asks ?? []
          if (!bids.length || !asks.length) return { output: `Book vazio para ${symbol}.` }

          const bestBid = Number(bids[0]![0])
          const bestAsk = Number(asks[0]![0])
          const mid = (bestBid + bestAsk) / 2
          const spreadBps = ((bestAsk - bestBid) / mid) * 10000

          const somaQtd = (rows: [string, string][]) =>
            rows.slice(0, niveis).reduce((acc, row) => acc + Number(row[1]), 0)
          const qb = somaQtd(bids)
          const qa = somaQtd(asks)
          const imbalance = qb / (qb + qa)

          return {
            title: `${symbol} spread ${spreadBps.toFixed(2)} bps · imb ${imbalance.toFixed(2)}`,
            output: [
              `Par: ${symbol}`,
              `Best bid / ask: ${num(bestBid, 6)} / ${num(bestAsk, 6)}`,
              `Mid: ${num(mid, 6)}`,
              `Spread: ${spreadBps.toFixed(2)} bps`,
              `Imbalance (top ${niveis}): ${imbalance.toFixed(3)}  (${imbalance > 0.5 ? "pressão compradora" : "pressão vendedora"})`,
            ].join("\n"),
            metadata: { symbol, bestBid, bestAsk, mid, spreadBps, imbalance },
          }
        },
      }),
    },

    // Trading = baixa criatividade. Fixa temperatura no máximo em 0,1.
    "chat.params": async (_input, output) => {
      output.temperature = Math.min(output.temperature ?? 0.1, 0.1)
    },
  }
}

// Forma exigida pelo loader do opencode: default export { id, server }.
export default { id: "mercado", server: MercadoPlugin }
