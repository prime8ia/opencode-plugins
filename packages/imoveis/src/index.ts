/**
 * ============================================================================
 *  opencode-plugin-imoveis — Imóveis & Avaliação (NBR 14653)
 * ============================================================================
 *
 *  Plugin do opencode (publicável no npm). Demonstra os principais ganchos da
 *  API de plugins aplicados ao domínio de avaliação imobiliária.
 *
 *  Ganchos:
 *   - tool.*               → 2 ferramentas (avaliação comparativa + laudo)
 *   - permission.ask       → trilho de segurança automático
 *   - tool.execute.after   → auditoria (JSONL de tudo que o agente roda)
 *   - chat.params          → precisão técnica (temperatura baixa)
 *   - event                → reação a eventos de sessão
 *
 *  Entrypoint resolvido pelo opencode via `exports["./server"]` no package.json.
 *  O default export precisa ter a forma { id, server }.
 * ============================================================================
 */

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { appendFile } from "node:fs/promises"
import path from "node:path"

// Um plugin é uma função async que recebe o contexto e devolve os hooks.
// Capturamos `directory` e `worktree` no closure para uso nas tools/hooks.
// (o contexto também traz `client` (SDK) e `$` (shell do Bun), aqui não usados)
export const ImoveisPlugin: Plugin = async ({ directory, worktree }) => {
  // Arquivos persistentes ficam DENTRO do projeto onde o opencode roda.
  const arquivoHistorico = path.join(directory, "avaliacoes-historico.jsonl")
  const arquivoAuditoria = path.join(directory, ".opencode-auditoria.jsonl")

  // Datas no formato dd mm aaaa (ex: 19 06 2026).
  const dataHoje = () => {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, "0")
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    return `${dd} ${mm} ${d.getFullYear()}`
  }

  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })

  // Anexa uma linha a um arquivo JSONL (cria se não existir).
  // node:fs/promises funciona tanto em Node quanto em Bun.
  const append = (file: string, linha: string) => appendFile(file, linha)

  return {
    // ========================================================================
    //  HOOK: tool  — registra ferramentas que o agente pode chamar
    // ========================================================================
    tool: {
      /**
       * Método comparativo direto de dados de mercado (NBR 14653-2).
       * OBS.: tratamento estatístico SIMPLIFICADO (didático). Avaliação formal
       * exige modelo de regressão/homogeneização completo conforme a norma.
       */
      avaliacao_comparativa: tool({
        description:
          "Estima o valor de mercado de um imóvel pelo método comparativo direto (NBR 14653-2). " +
          "Aplica fator de oferta, saneia a amostra e retorna o valor unitário (R$/m²), o valor " +
          "total estimado e o coeficiente de variação (indicativo de fundamentação).",
        args: {
          areaAvaliando: tool.schema
            .number()
            .positive()
            .describe("Área (privativa/construída) do imóvel avaliando, em m²"),
          comparaveis: tool.schema
            .array(
              tool.schema.object({
                area: tool.schema.number().positive().describe("Área do comparável em m²"),
                valor: tool.schema.number().positive().describe("Valor TOTAL anunciado do comparável, em R$"),
                fonte: tool.schema.string().optional().describe("Origem do dado (portal, corretor, escritura)"),
              }),
            )
            .min(3)
            .describe("Mínimo de 3 dados de mercado (amostra para tratamento)"),
          fatorOferta: tool.schema
            .number()
            .min(0.5)
            .max(1)
            .default(0.9)
            .describe("Fator de oferta/elasticidade. 0,90 = desconto de 10% sobre o preço anunciado"),
        },
        async execute(args) {
          // Tools de plugin recebem os args SEM os defaults do Zod aplicados
          // (o registry do opencode valida por predicado e repassa o args cru).
          // Por isso aplicamos o default manualmente aqui.
          const fatorOferta = args.fatorOferta ?? 0.9

          // 1) Valor unitário (R$/m²) de cada comparável, já com fator de oferta.
          const unitarios = args.comparaveis.map((c) => (c.valor / c.area) * fatorOferta)

          // 2) Saneamento simples: descarta dados fora de [média ± 1 desvio].
          const mediaBruta = unitarios.reduce((a, b) => a + b, 0) / unitarios.length
          const desvioBruto = Math.sqrt(
            unitarios.reduce((a, b) => a + (b - mediaBruta) ** 2, 0) / unitarios.length,
          )
          const saneados = unitarios.filter((u) => Math.abs(u - mediaBruta) <= desvioBruto || unitarios.length <= 3)
          const descartados = unitarios.length - saneados.length

          // 3) Estatística da amostra saneada.
          const media = saneados.reduce((a, b) => a + b, 0) / saneados.length
          const desvio = Math.sqrt(saneados.reduce((a, b) => a + (b - media) ** 2, 0) / saneados.length)
          const cv = desvio / media // coeficiente de variação

          // 4) Grau de fundamentação (regra prática a partir do CV).
          const grau =
            cv <= 0.15 ? "Grau III (CV ≤ 15%)" : cv <= 0.3 ? "Grau II (15% < CV ≤ 30%)" : "Grau I (CV > 30%)"

          const valorTotal = media * args.areaAvaliando
          // Campo de arbítrio de ±15% admitido pela norma.
          const minimo = valorTotal * 0.85
          const maximo = valorTotal * 1.15

          const output = [
            `## Avaliação — Método Comparativo Direto (NBR 14653-2)`,
            `Data: ${dataHoje()}`,
            ``,
            `- Área do avaliando: ${args.areaAvaliando} m²`,
            `- Amostra: ${args.comparaveis.length} dados (${descartados} descartado(s) no saneamento)`,
            `- Fator de oferta aplicado: ${fatorOferta}`,
            ``,
            `**Valor unitário saneado:** ${brl(media)}/m² (σ = ${brl(desvio)}, CV = ${(cv * 100).toFixed(1)}%)`,
            `**Valor de mercado estimado:** ${brl(valorTotal)}`,
            `**Campo de arbítrio (±15%):** ${brl(minimo)} a ${brl(maximo)}`,
            `**Fundamentação indicativa:** ${grau}`,
          ].join("\n")

          // O resultado pode ser string OU { title, output, metadata }.
          return {
            title: `Avaliação ${brl(valorTotal)}`,
            output,
            metadata: {
              valorUnitario: Math.round(media),
              valorTotal: Math.round(valorTotal),
              cv,
              grau,
              descartados,
            },
          }
        },
      }),

      /**
       * Gera um trecho de laudo em Markdown (Obsidian) e o registra no histórico
       * de avaliações do imóvel (1 linha JSONL por laudo).
       */
      laudo_trecho: tool({
        description:
          "Gera um trecho de laudo de avaliação imobiliária em Markdown (Obsidian) e o anexa ao " +
          "histórico de avaliações do projeto (avaliacoes-historico.jsonl).",
        args: {
          imovel: tool.schema.string().describe("Identificação do imóvel (endereço/matrícula)"),
          finalidade: tool.schema
            .string()
            .default("Determinação do valor de mercado para venda")
            .describe("Finalidade da avaliação"),
          valor: tool.schema.number().positive().describe("Valor de mercado estimado, em R$"),
          metodologia: tool.schema
            .string()
            .default("Método comparativo direto de dados de mercado (NBR 14653-2)")
            .describe("Metodologia empregada"),
          observacoes: tool.schema.string().optional().describe("Observações/ressalvas técnicas"),
        },
        async execute(args, ctx) {
          // Pede confirmação ao usuário ANTES de gravar (integra ao sistema de
          // permissões do opencode, ação "edit").
          await ctx.ask({
            permission: "edit",
            patterns: [path.relative(worktree, arquivoHistorico)],
            always: ["*"],
            metadata: { filepath: arquivoHistorico, descricao: "Anexar laudo ao histórico" },
          })

          // Defaults aplicados manualmente (ver nota na tool acima).
          const finalidade = args.finalidade ?? "Determinação do valor de mercado para venda"
          const metodologia = args.metodologia ?? "Método comparativo direto de dados de mercado (NBR 14653-2)"

          const data = dataHoje()
          const trecho = [
            `## Laudo de Avaliação — ${args.imovel}`,
            ``,
            `- **Data:** ${data}`,
            `- **Finalidade:** ${finalidade}`,
            `- **Metodologia:** ${metodologia}`,
            `- **Valor de mercado:** ${brl(args.valor)}`,
            args.observacoes ? `- **Observações:** ${args.observacoes}` : null,
            ``,
            `> Avaliação fundamentada conforme NBR 14653 (Partes 1 e 2).`,
            `> Documento gerado em ${data}.`,
          ]
            .filter(Boolean)
            .join("\n")

          await append(
            arquivoHistorico,
            JSON.stringify({ data, imovel: args.imovel, valor: args.valor, metodologia }) + "\n",
          )

          return {
            title: `Laudo: ${args.imovel}`,
            output: `${trecho}\n\n_Registrado em \`${path.basename(arquivoHistorico)}\`._`,
          }
        },
      }),
    },

    // ========================================================================
    //  HOOK: permission.ask  — trilho de segurança automático
    // ========================================================================
    "permission.ask": async (input, output) => {
      const comando: string = (input as { metadata?: { command?: string } })?.metadata?.command ?? ""
      // Auto-aprova leituras inofensivas.
      if (/^\s*(git\s+(status|log|diff|show)|ls|cat|pwd)\b/.test(comando)) {
        output.status = "allow"
        return
      }
      // Bloqueia comandos manifestamente destrutivos.
      if (/\brm\s+-rf\b|\bgit\s+push\s+--force\b|\bdrop\s+table\b/i.test(comando)) {
        output.status = "deny"
        return
      }
      // Demais casos: mantém o comportamento padrão (perguntar).
    },

    // ========================================================================
    //  HOOK: chat.params  — sampling do modelo (precisão técnica)
    // ========================================================================
    "chat.params": async (_input, output) => {
      output.temperature = Math.min(output.temperature ?? 0.2, 0.2)
    },

    // ========================================================================
    //  HOOK: tool.execute.after  — auditoria
    // ========================================================================
    "tool.execute.after": async (input, output) => {
      await append(
        arquivoAuditoria,
        JSON.stringify({
          ts: new Date().toISOString(),
          tool: input.tool,
          sessionID: input.sessionID,
          title: output.title,
        }) + "\n",
      )
    },

    // ========================================================================
    //  HOOK: event  — reage a eventos do sistema (filtrados pela pasta)
    // ========================================================================
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await append(arquivoAuditoria, JSON.stringify({ ts: new Date().toISOString(), evento: "session.idle" }) + "\n")
      }
    },
  }
}

// Forma moderna exigida pelo loader do opencode: default export { id, server }.
export default { id: "imoveis", server: ImoveisPlugin }
