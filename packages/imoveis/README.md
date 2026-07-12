# opencode-plugin-imoveis

Plugin do [opencode](https://opencode.ai) para **avaliação imobiliária (NBR 14653)**.
Serve também de exemplo didático da API de plugins. Pacote npm publicável,
**type-checado** contra `@opencode-ai/plugin`.

## O que faz

| Gancho | Função |
|--------|--------|
| `tool.avaliacao_comparativa` | Método comparativo direto (NBR 14653-2): fator de oferta, saneamento de outliers, CV e grau de fundamentação, campo de arbítrio ±15% |
| `tool.laudo_trecho` | Gera trecho de laudo em Markdown (Obsidian) e registra no histórico do imóvel |
| `permission.ask` | Auto-aprova leituras seguras (`git status/log/diff`, `ls`…); bloqueia destrutivos (`rm -rf`, `push --force`) |
| `chat.params` | Fixa temperatura baixa (0,2) para precisão técnica |
| `tool.execute.after` | Auditoria: registra cada tool executada em `.opencode-auditoria.jsonl` |
| `event` | Registra `session.idle` na auditoria |

## Estrutura

```
opencode-plugin-imoveis/
├─ package.json      # exports["./server"] → dist/index.js ; engines.opencode
├─ tsconfig.json     # NodeNext, strict, declaration
├─ src/index.ts      # fonte: default export { id: "imoveis", server: ImoveisPlugin }
├─ dist/             # build: index.js + index.d.ts (+ sourcemaps) — gerado por `npm run build`
└─ README.md
```

Compilado para JavaScript ESM (`dist/`), roda em **Node** e em **Bun**. As tools
usam `node:fs/promises` (sem dependência de globais do Bun).

## Desenvolvimento

```bash
npm install        # @opencode-ai/plugin, @types/node, typescript
npm run typecheck  # tsc --noEmit          (passa limpo)
npm run build      # tsc → dist/index.js + index.d.ts
```

## Instalação no opencode

No config (`opencode.json` do projeto ou `~/.config/opencode/opencode.json`):

**A) Por caminho de diretório (desenvolvimento local)** — o loader lê o
`package.json` e resolve `exports["./server"]`:

```json
{
  "plugin": ["D:/Documentos/Tecnologia/IA/Claude/Claude Code/Robos/opencode-plugin-imoveis"]
}
```

**B) Por npm (após publicar)** — `prepublishOnly` roda o build automaticamente:

```bash
npm publish --access public
```
```json
{
  "plugin": ["opencode-plugin-imoveis"]
}
```

> O tarball publicado contém apenas `dist/` + `README.md` + `package.json`
> (verifique com `npm pack --dry-run`). Edite sempre em `src/` e rode `npm run build`.

## Arquivos gerados (no projeto onde o opencode roda)

- `avaliacoes-historico.jsonl` — 1 laudo por linha (histórico por imóvel)
- `.opencode-auditoria.jsonl` — trilha de auditoria das tools/eventos

## Notas técnicas

- **Tratamento estatístico simplificado** (didático). Avaliação formal exige
  modelo de regressão/homogeneização completo conforme a NBR 14653-2.
- Tools de plugin recebem os args **sem** os defaults do Zod aplicados — por isso
  os defaults são reaplicados dentro de cada `execute` (`args.x ?? padrão`).
- O hook `permission.ask` lê o comando de `input.metadata.command`; se a chave
  diferir na sua versão do opencode, o plugin cai no comportamento padrão (perguntar).
- Compatibilidade declarada em `engines.opencode` (checada pelo loader apenas para
  plugins npm, quando a versão major do opencode for > 0).
```
