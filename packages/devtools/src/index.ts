/**
 * ============================================================================
 *  opencode-plugin-devtools — Produtividade no código
 * ============================================================================
 *
 *  Plugin do opencode com tools utilitárias de desenvolvimento, neutras e
 *  reutilizáveis em qualquer projeto.
 *
 *  Tools:
 *   - git_status   → branch + arquivos modificados (git status --porcelain)
 *   - git_diff     → diff do working tree (com --stat opcional)
 *   - buscar_todos → varre o projeto por TODO/FIXME/HACK/XXX (walk em JS, portátil)
 *
 *  Hook:
 *   - tool.execute.after → auditoria leve em .opencode-devtools.jsonl
 *
 *  Compila para dist/ (ESM). Roda em Node e em Bun. Usa node:child_process e
 *  node:fs/promises (sem globais do Bun).
 * ============================================================================
 */

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { execFile } from "node:child_process"
import { appendFile, readdir, readFile, stat } from "node:fs/promises"
import { promisify } from "node:util"
import path from "node:path"

const exec = promisify(execFile)

// Diretórios ignorados na busca de TODOs.
const IGNORAR = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", "coverage"])
// Extensões consideradas "texto/código".
const EXT_CODIGO = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".css",
  ".scss",
  ".html",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".sh",
  ".ps1",
])

export const DevtoolsPlugin: Plugin = async ({ directory }) => {
  const auditoria = path.join(directory, ".opencode-devtools.jsonl")

  // Executa um comando e devolve stdout, ou uma string de erro legível
  // (nunca lança: não derruba a execução da tool).
  const run = async (cmd: string, cmdArgs: string[]): Promise<string> => {
    try {
      const { stdout } = await exec(cmd, cmdArgs, { cwd: directory, maxBuffer: 16 * 1024 * 1024 })
      return stdout
    } catch (e) {
      const err = e as { stderr?: string; message?: string }
      return `erro: ${(err.stderr || err.message || String(e)).trim()}`
    }
  }

  return {
    tool: {
      /** Estado do working tree: branch + arquivos modificados. */
      git_status: tool({
        description: "Mostra o branch atual e os arquivos modificados no working tree (git status --porcelain -b).",
        args: {},
        async execute() {
          const out = await run("git", ["status", "--porcelain=v1", "-b"])
          const linhas = out.split("\n").filter(Boolean)
          const modificados = linhas.filter((l) => !l.startsWith("##")).length
          return {
            title: `git status (${modificados} modificado(s))`,
            output: out.trim() || "working tree limpo",
          }
        },
      }),

      /** Diff do working tree, com --stat opcional e caminho opcional. */
      git_diff: tool({
        description: "Mostra o diff do working tree. Use resumo=true para --stat, e caminho para limitar a um arquivo/pasta.",
        args: {
          resumo: tool.schema.boolean().default(false).describe("Se true, usa --stat (resumo por arquivo)"),
          caminho: tool.schema.string().optional().describe("Limita o diff a um arquivo ou diretório"),
        },
        async execute(args) {
          const flags = args.resumo ? ["--stat"] : []
          const alvo = args.caminho ? ["--", args.caminho] : []
          const out = await run("git", ["diff", ...flags, ...alvo])
          return {
            title: `git diff${args.resumo ? " --stat" : ""}`,
            output: out.trim() || "sem alterações",
          }
        },
      }),

      /** Varre o projeto por marcadores TODO/FIXME/HACK/XXX. */
      buscar_todos: tool({
        description:
          "Varre o projeto (ignorando node_modules/.git/dist) por marcadores TODO, FIXME, HACK e XXX, " +
          "retornando arquivo:linha e o texto. Use subdir para restringir a uma pasta.",
        args: {
          subdir: tool.schema.string().optional().describe("Subpasta relativa a varrer (default: raiz do projeto)"),
          max: tool.schema.number().int().min(1).max(1000).default(200).describe("Máximo de ocorrências"),
        },
        async execute(args) {
          const raiz = args.subdir ? path.join(directory, args.subdir) : directory
          const max = args.max ?? 200
          const marcador = /\b(TODO|FIXME|HACK|XXX)\b/
          const hits: string[] = []

          const walk = async (dir: string): Promise<void> => {
            if (hits.length >= max) return
            const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
            for (const entry of entries) {
              if (hits.length >= max) return
              if (entry.isDirectory()) {
                if (IGNORAR.has(entry.name)) continue
                await walk(path.join(dir, entry.name))
                continue
              }
              if (!EXT_CODIGO.has(path.extname(entry.name))) continue
              const full = path.join(dir, entry.name)
              const info = await stat(full).catch(() => null)
              if (!info || info.size > 2 * 1024 * 1024) continue // pula arquivos > 2 MB
              const texto = await readFile(full, "utf8").catch(() => "")
              const linhas = texto.split("\n")
              for (let i = 0; i < linhas.length; i++) {
                if (!marcador.test(linhas[i]!)) continue
                hits.push(`${path.relative(directory, full)}:${i + 1}: ${linhas[i]!.trim()}`)
                if (hits.length >= max) break
              }
            }
          }

          await walk(raiz)
          return {
            title: `${hits.length} marcador(es)`,
            output: hits.length ? hits.join("\n") : "nenhum TODO/FIXME/HACK/XXX encontrado",
            metadata: { total: hits.length },
          }
        },
      }),
    },

    // Auditoria leve de tudo que o agente executa.
    "tool.execute.after": async (input, output) => {
      await appendFile(
        auditoria,
        JSON.stringify({ ts: new Date().toISOString(), tool: input.tool, title: output.title }) + "\n",
      )
    },
  }
}

// Forma exigida pelo loader do opencode: default export { id, server }.
export default { id: "devtools", server: DevtoolsPlugin }
