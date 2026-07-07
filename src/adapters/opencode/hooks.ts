import type { Hooks } from "@opencode-ai/plugin"
import { compressShellThroughPipeline } from "../../core/pipeline.js"
import { transformHistory } from "../../history.js"
import type { MetricsLedger } from "../../metrics.js"
import type { RawStore } from "../../raw-store.js"
import type { DensityConfig } from "../../types.js"

export interface OpenCodeHookDependencies {
  config: DensityConfig
  ledger: MetricsLedger
  rawStore: RawStore
  recordedHistoryParts: Set<string>
  log?: (level: "debug" | "info" | "warn" | "error", message: string, error?: unknown) => Promise<void>
}

export function createOpenCodeHooks(deps: OpenCodeHookDependencies): Pick<
  Hooks,
  "tool.execute.after" | "experimental.chat.messages.transform" | "experimental.session.compacting" | "event"
> {
  return {
    "tool.execute.after": async (input, output) => {
      if (typeof output.output !== "string") return
      const command = typeof input.args?.command === "string" ? input.args.command : ""
      const compressed = await compressShellThroughPipeline({
        sessionID: input.sessionID,
        tool: input.tool,
        command,
        output: output.output,
        deps: {
          config: deps.config,
          metrics: deps.ledger,
          rawStore: deps.rawStore,
          logger: deps.log ? { log: deps.log } : undefined,
        },
      })
      if (!compressed) return
      output.output = compressed.text
      output.metadata = {
        ...(output.metadata ?? {}),
        contextDensity: { ...compressed.result, rawID: compressed.rawID },
      }
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      transformHistory(output.messages, deps.config.history, deps.ledger, deps.recordedHistoryParts)
    },

    "experimental.session.compacting": async (input, output) => {
      if (!deps.config.compaction.enabled) return
      const metrics = deps.ledger.snapshot(input.sessionID)
      output.context.push(
        [
          "## Context-density compaction rules",
          "- Collapse completed subtask history to outcome, evidence, changed files, and any remaining risk.",
          "- Merge repeated errors into: signature, occurrence count, attempted fixes, latest state, and project-local stack frames.",
          "- Do not reproduce compressed or duplicate tool output. Preserve raw observation ids when they may still be needed.",
          "- Preserve exact user requirements, unresolved decisions, edit locations, test failures, and next actions.",
          `- This session has saved an estimated ${metrics.savedTokens} input tokens across ${metrics.calls} compressed observations.`,
        ].join("\n"),
      )
    },

    event: async ({ event }) => {
      if (event.type === "session.compacted") deps.ledger.compacted(event.properties.sessionID)
      if (event.type === "session.deleted") deps.ledger.remove(event.properties.info.id)
    },
  }
}
