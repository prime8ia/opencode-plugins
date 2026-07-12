# opencode-plugins

Monorepo de plugins do [opencode](https://opencode.ai). Cada pacote é publicável
independente no npm; a raiz compartilha dependências e orquestra build/typecheck
com **turbo**.

## Pacotes

| Pacote | Nome npm | O que faz |
|--------|----------|-----------|
| [`packages/imoveis`](packages/imoveis) | `opencode-plugin-imoveis` | Avaliação NBR 14653: método comparativo, laudo Markdown, auditoria, trilhos de permissão |
| [`packages/mercado`](packages/mercado) | `opencode-plugin-mercado` | Cotação/orderbook Binance, spread e half-spread em bps |
| [`packages/devtools`](packages/devtools) | `opencode-plugin-devtools` | `git status`/`diff`, busca de TODO/FIXME |

## Uso do monorepo

```bash
npm install          # 1 install para os 3 pacotes (deps içadas p/ a raiz)
npm run typecheck    # turbo run typecheck  (roda tsc --noEmit nos 3)
npm run build        # turbo run build      (dist/ nos 3, com cache)
npm run clean        # limpa dist/ e cache do turbo
```

Publicar um pacote específico:

```bash
npm run build
npm publish -w opencode-plugin-mercado --access public
# ou todos: npm run publish:all
```

## Carregar os 3 no opencode

O arquivo [`opencode.json`](opencode.json) na raiz já aponta para os três (por
caminho de diretório). Copie o array `plugin` para o seu config do opencode
(`opencode.json` do projeto ou `~/.config/opencode/opencode.json`).

Após `npm publish`, troque os caminhos pelos nomes npm:

```json
{
  "plugin": ["opencode-plugin-imoveis", "opencode-plugin-mercado", "opencode-plugin-devtools"]
}
```

## Estrutura

```
opencode-plugins/
├─ package.json          # workspaces + devDeps compartilhadas (@opencode-ai/plugin, typescript, turbo)
├─ turbo.json            # pipeline build/typecheck/clean
├─ tsconfig.base.json    # opções de compilador comuns (NodeNext, strict)
├─ opencode.json         # exemplo carregando os 3 plugins
└─ packages/
   ├─ imoveis/   (tsconfig estende ../../tsconfig.base.json)
   ├─ mercado/
   └─ devtools/
```

> Cada pacote lista `@opencode-ai/plugin` como **peerDependency**; a versão de
> desenvolvimento fica pinada só na raiz. Para clonar um pacote isolado fora do
> monorepo, reinstale as devDeps (`@opencode-ai/plugin`, `typescript`, `@types/node`).
