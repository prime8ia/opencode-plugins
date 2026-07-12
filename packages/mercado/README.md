# opencode-plugin-mercado

Plugin do [opencode](https://opencode.ai) com tools de **dados de mercado cripto**
para uso em análise/robôs de trading. Pacote npm publicável, compilado para
`dist/` (ESM), roda em **Node** e em **Bun**.

## Tools

| Tool | Função |
|------|--------|
| `spread_bps` | Cálculo puro (offline): bid/ask → mid, spread absoluto, spread e **half-spread em bps** |
| `cotacao_binance` | Ticker 24h da Binance spot (preço, variação %, máx/mín, volume) via REST público |
| `orderbook_binance` | Book L2 da Binance: best bid/ask, spread em bps, mid e **order-book imbalance** dos top N níveis |

Hook incluído: `chat.params` fixa `temperature ≤ 0,1` (decisão de trading = precisão).

## Configuração (opção do plugin)

O 2º argumento do plugin aceita `{ base }` para trocar o endpoint (ex.: testnet
ou espelho). Default: `https://api.binance.com`.

```json
{
  "plugin": [
    ["D:/Documentos/Tecnologia/IA/Claude/Claude Code/Robos/opencode-plugin-mercado", { "base": "https://api.binance.com" }]
  ]
}
```

## Desenvolvimento

```bash
npm install
npm run typecheck   # tsc --noEmit  (passa limpo)
npm run build       # tsc → dist/index.js + index.d.ts
```

## Instalação no opencode

**A) Por diretório** (dev local): `"plugin": ["D:/.../opencode-plugin-mercado"]`
**B) Por npm** (após `npm publish`): `"plugin": ["opencode-plugin-mercado"]`

## Notas

- Usa `fetch` global (Node 18+ / Bun). As tools de rede têm timeout de 8 s e
  **retornam string de erro** ao modelo em vez de derrubar a execução.
- Tools de plugin recebem args **sem** os defaults do Zod — reaplicados no `execute`.
- Half-spread é a métrica central de viabilidade do robô maker (fee vs spread).
