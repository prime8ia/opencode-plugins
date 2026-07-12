# Passo a passo — opencode-plugins

Guia de consulta rápida do monorepo. Criado em 11 07 2026.

**Pasta:** `D:\Documentos\Tecnologia\IA\Claude\Claude Code\Robos\opencode-plugins`

---

## 1. Para que serve

Casa única dos plugins do [opencode](https://opencode.ai) — extensões que dão ao
agente de IA ferramentas suas:

| Pacote | O agente ganha |
|--------|----------------|
| `packages/imoveis` | `avaliacao_comparativa` (valor por comparação NBR 14653-2) e `laudo_trecho` (laudo Markdown + histórico) |
| `packages/mercado` | `cotacao_binance`, `orderbook_binance` (dados ao vivo) e `spread_bps` (half-spread em bps) |
| `packages/devtools` | `git_status`, `git_diff`, `buscar_todos` (TODOs/FIXMEs do projeto) |

Na prática: com os plugins carregados, você pede em linguagem natural — *"avalie
um apartamento de 100 m² com estes 3 comparáveis..."* — e o agente **chama a sua
tool** em vez de improvisar.

O monorepo existe para: **1 install, 1 build, 1 typecheck** para os três; versão
do `@opencode-ai/plugin` pinada num lugar só; cada pacote continua publicável
separado no npm.

---

## 2. Como utilizar (dia a dia)

### 2.1 Preparar (uma vez por máquina)

```powershell
cd "D:\Documentos\Tecnologia\IA\Claude\Claude Code\Robos\opencode-plugins"
npm install        # instala deps dos 3 pacotes de uma vez
npm run build      # compila os 3 → packages/*/dist/
```

### 2.2 Ciclo de desenvolvimento (sempre que editar um plugin)

```powershell
# 1. edite o fonte:  packages/<nome>/src/index.ts
# 2. valide tipos:
npm run typecheck
# 3. recompile (turbo só recompila o que mudou):
npm run build
```

> **Regra de ouro:** edite sempre em `src/`, nunca em `dist/` — o `dist/` é
> gerado e é ele que o opencode carrega.

### 2.3 Executar dentro do opencode

Os plugins não rodam sozinhos — quem os executa é o **opencode**:

1. Instale o opencode (se ainda não tiver):
   `scoop install opencode`  ou  `npm i -g opencode-ai@latest`
2. Abra a pasta do projeto onde quer usá-los (qualquer projeto seu)
3. Crie/edite ali um `opencode.json` copiando o array `plugin` do
   [`opencode.json`](opencode.json) da raiz deste monorepo:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "D:/Documentos/Tecnologia/IA/Claude/Claude Code/Robos/opencode-plugins/packages/imoveis",
    ["D:/Documentos/Tecnologia/IA/Claude/Claude Code/Robos/opencode-plugins/packages/mercado", { "base": "https://api.binance.com" }],
    "D:/Documentos/Tecnologia/IA/Claude/Claude Code/Robos/opencode-plugins/packages/devtools"
  ]
}
```

4. Rode `opencode` nessa pasta
5. Teste: digite *"use a tool spread_bps com bid 99.9 e ask 100.1"* —
   deve responder spread 20 bps / half-spread 10 bps

> Para valer em **todos** os projetos, ponha o mesmo `plugin` no config global:
> `C:\Users\Fastlogic\.config\opencode\opencode.json`

---

## 3. Como e onde publicar

Dois destinos **independentes**:

### 3.A GitHub (versionar/backup) — recomendado primeiro

O repositório git local já existe (commit inicial `ab89d98`). Falta o remote:

1. Crie um repositório vazio em github.com (ex.: `opencode-plugins`),
   **sem** README/gitignore inicial
2. Conecte e envie:

```powershell
cd "D:\Documentos\Tecnologia\IA\Claude\Claude Code\Robos\opencode-plugins"
git remote add origin https://github.com/SEU_USUARIO/opencode-plugins.git
git push -u origin main
```

### 3.B npm (instalável por qualquer um — PÚBLICO)

> ✅ **FEITO em 11 07 2026** — os 3 pacotes estão publicados em v0.1.0 pela conta
> `prime8.ia` (2FA ativado, exigido pelo npm p/ publicar):
> - <https://www.npmjs.com/package/opencode-plugin-imoveis>
> - <https://www.npmjs.com/package/opencode-plugin-mercado>
> - <https://www.npmjs.com/package/opencode-plugin-devtools>
>
> Config em qualquer máquina agora é só:
> `{ "plugin": ["opencode-plugin-imoveis", "opencode-plugin-mercado", "opencode-plugin-devtools"] }`
>
> Os passos abaixo ficam como referência p/ novas versões/pacotes.

⚠️ Publicar no npm é **público e permanente** (unpublish restrito a 72 h).

1. Conta: <https://www.npmjs.com/signup> (se não tiver)
2. Login na máquina (abre o navegador para autenticar):

```powershell
npm login
npm whoami        # confirma que logou
```

3. Publique um pacote para testar (o `prepublishOnly` builda sozinho):

```powershell
cd "D:\Documentos\Tecnologia\IA\Claude\Claude Code\Robos\opencode-plugins"
npm publish -w opencode-plugin-devtools --access public --dry-run   # ensaio
npm publish -w opencode-plugin-devtools --access public             # de verdade
```

4. Os outros dois (ou todos de uma vez):

```powershell
npm publish -w opencode-plugin-imoveis --access public
npm publish -w opencode-plugin-mercado --access public
# atalho para os 3:
npm run publish:all
```

5. **Depois de publicado**, o config fica simples em qualquer máquina
   (o opencode baixa do npm sozinho):

```json
{ "plugin": ["opencode-plugin-imoveis", "opencode-plugin-mercado", "opencode-plugin-devtools"] }
```

6. Versões futuras: edite o código → suba a versão → publique → commit:

```powershell
npm version patch -w opencode-plugin-mercado          # 0.1.0 → 0.1.1
npm publish -w opencode-plugin-mercado --access public
git add -A ; git commit -m "chore(mercado): v0.1.1" ; git push
```

### Qual escolher?

| Cenário | Destino |
|---------|---------|
| Só você usa, nesta máquina | Nada a publicar — caminho de diretório (2.3) resolve |
| Backup/histórico/outras máquinas suas | GitHub (3.A) |
| Compartilhar com o mundo / instalar por nome | npm (3.B), idealmente com GitHub antes |

---

## Solução de problemas

- **`npm run build` falha após editar** → rode `npm run typecheck` e leia o erro
  de tipo; o build usa o mesmo `tsc`.
- **opencode não acha a tool** → confira se o caminho no `opencode.json` aponta
  para a **pasta do pacote** (não para `src/` nem `dist/`) e se `dist/` existe
  (rode `npm run build`).
- **Erro de rede na `cotacao_binance`** → a tool retorna a mensagem de erro ao
  modelo (timeout 8 s); verifique conexão/geoblock. Endpoint alternativo via
  opção `{ "base": "..." }`.
- **Cache estranho do turbo** → `npm run clean` e builde de novo.
