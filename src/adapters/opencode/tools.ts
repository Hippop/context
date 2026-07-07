import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { tool } from "@opencode-ai/plugin"
import type { DensityConfig } from "../../types.js"
import type { MetricsLedger } from "../../metrics.js"
import type { RawStore } from "../../raw-store.js"
import { compressReadThroughPipeline, metricFrom } from "../../core/pipeline.js"
import type { ReadMode } from "../../compressors/read.js"
import { askReadPermission, validateReadablePath } from "./permissions.js"

export interface OpenCodeToolDependencies {
  config: DensityConfig
  ledger: MetricsLedger
  rawStore: RawStore
}

export function createOpenCodeTools(deps: OpenCodeToolDependencies) {
  return {
    token_save_read: tool({
      description:
        "Read a compressed, exploratory view of code, instructions, logs, Markdown, JSON, or XML. Use this for discovery and orientation. Before editing, always use OpenCode's native read tool on the exact target range because this view may omit comments or formatting.",
      args: {
        filePath: tool.schema.string().describe("Absolute path or path relative to the current session directory"),
        mode: tool.schema.enum(["auto", "code", "log", "markdown", "instruction", "json", "xml", "raw"]).default("auto"),
        offset: tool.schema.number().int().positive().default(1).describe("1-based starting line"),
        limit: tool.schema.number().int().positive().optional().describe("Maximum source lines to inspect"),
      },
      async execute(args, context) {
        const filePath = path.isAbsolute(args.filePath) ? args.filePath : path.resolve(context.directory, args.filePath)
        const safePath = await validateReadablePath(filePath, context.worktree)
        await askReadPermission(context, safePath)
        const info = await stat(safePath)
        if (!info.isFile()) throw new Error(`token_save_read only supports files: ${args.filePath}`)
        if (info.size > deps.config.read.maxBytes) {
          throw new Error(
            `File is ${info.size} bytes; token_save_read maxBytes is ${deps.config.read.maxBytes}. Use native read with a narrow range.`,
          )
        }

        const source = await readFile(safePath, "utf8")
        if (source.includes("\0")) throw new Error("Binary files are not supported")
        const lines = source.split("\n")
        // OpenCode validates plugin Zod schemas but does not replace the input
        // with Zod's parsed/defaulted value, so runtime defaults stay explicit.
        const offset = args.offset ?? 1
        const limit = args.limit ?? deps.config.read.defaultLimit
        const mode = (args.mode ?? "auto") as ReadMode
        const selected = lines.slice(offset - 1, offset - 1 + limit).join("\n")
        const result = compressReadThroughPipeline({
          filePath: safePath,
          text: selected,
          requestedMode: mode,
          config: deps.config.read,
        })
        const rangeEnd = Math.min(lines.length, offset + limit - 1)
        const body = result.applied ? result.text : selected
        const header = [
          `<context-density exploratory="true" mode="${result.mode}" source-lines="${offset}-${rangeEnd}" total-lines="${lines.length}">`,
          `Compressed view: ~${result.originalTokens} → ~${result.compressedTokens} estimated tokens; stages: ${result.stages.join(", ") || "passthrough"}.`,
          "Safety: use native read on the exact target range before edit/write/apply_patch.",
          "</context-density>",
        ].join("\n")
        const output = `${header}\n${body}`
        if (result.applied) deps.ledger.record(context.sessionID, "read", metricFrom(result, output.length - body.length))
        return {
          title: `Compressed read: ${path.relative(context.worktree, safePath)}`,
          output,
          metadata: { contextDensity: result, sourcePath: safePath, offset, limit },
        }
      },
    }),
    context_raw: tool({
      description: "Recover a paginated slice of a raw shell observation previously compressed by this plugin.",
      args: {
        id: tool.schema.string().describe("Raw observation id shown in a compressed shell result"),
        offset: tool.schema.number().int().nonnegative().default(0).describe("Character offset"),
        limit: tool.schema.number().int().positive().max(100_000).default(20_000).describe("Maximum characters"),
      },
      async execute(args, context) {
        const raw = await deps.rawStore.read(context.sessionID, args.id)
        const offset = args.offset ?? 0
        const limit = args.limit ?? 20_000
        const text = raw.text.slice(offset, offset + limit)
        const more = offset + text.length < raw.text.length
        return [
          `<raw-observation id="${args.id}" offset="${offset}" chars="${text.length}" total="${raw.text.length}">`,
          text,
          more ? `[more available; next offset: ${offset + text.length}]` : "[end of raw observation]",
          "</raw-observation>",
        ].join("\n")
      },
    }),
    context_report: tool({
      description: "Report estimated token savings, compression latency, and observed compaction count for this session.",
      args: {},
      async execute(_args, context) {
        return deps.ledger.format(context.sessionID)
      },
    }),
  }
}
