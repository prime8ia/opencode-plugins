# opencode-plugin-devtools

Plugin do [opencode](https://opencode.ai) com tools de **produtividade no código**,
neutras e reutilizáveis em qualquer projeto. Pacote npm publicável, compilado para
`dist/` (ESM), roda em **Node** e em **Bun**.

## Tools

| Tool | Função |
|------|--------|
| `git_status` | Branch atual + arquivos modificados (`git status --porcelain -b`) |
| `git_diff` | Diff do working tree; `resumo=true` → `--stat`; `caminho` limita a um arquivo/pasta |
| `buscar_todos` | Varre o projeto por `TODO`/`FIXME`/`HACK`/`XXX` (walk em JS, ignora `node_modules`/`.git`/`dist`) |

Hook incluído: `tool.execute.after` grava auditoria leve em `.opencode-devtools.jsonl`.

## Desenvolvimento

```bash
npm install
npm run typecheck   # tsc --noEmit  (passa limpo)
npm run build       # tsc → dist/index.js + index.d.ts
```

## Instalação no opencode

**A) Por diretório** (dev local): `"plugin": ["D:/.../opencode-plugin-devtools"]`
**B) Por npm** (após `npm publish`): `"plugin": ["opencode-plugin-devtools"]`

## Notas

- `git_*` usam `node:child_process` (portátil Node/Bun) com `cwd` = diretório do
  projeto da sessão e `maxBuffer` de 16 MB. Em erro (ex.: fora de um repo git),
  **retornam a mensagem** em vez de derrubar a tool.
- `buscar_todos` limita a 200 ocorrências por padrão e pula arquivos > 2 MB.
- Só percorre extensões de texto/código conhecidas (`.ts`, `.py`, `.md`, `.json`…).
