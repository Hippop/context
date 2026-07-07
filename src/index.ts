import type { Plugin } from "@opencode-ai/plugin"
import { createOpenCodeHooks } from "./adapters/opencode/hooks.js"
import { createOpenCodeTools } from "./adapters/opencode/tools.js"
import { resolveConfig } from "./config.js"
import { MetricsLedger } from "./metrics.js"
import { RawStore } from "./raw-store.js"
import type { DensityOptions } from "./types.js"

export type { DensityConfig, DensityOptions, MetricsSnapshot } from "./types.js"

export const ContextDensityPlugin: Plugin = async ({ worktree, client }, pluginOptions) => {
  const config = resolveConfig(pluginOptions as DensityOptions | undefined)
  const ledger = new MetricsLedger()
  const store = new RawStore(worktree, config.rawStore)
  const recordedHistoryParts = new Set<string>()
  const log = (level: "debug" | "info" | "warn" | "error", message: string, error?: unknown) =>
    safeLog(client, level, message, error)

  try {
    await store.initialize()
  } catch (error) {
    await log("warn", "Raw observation store could not be initialized", error)
  }

  return {
    tool: createOpenCodeTools({ config, ledger, rawStore: store }),
    ...createOpenCodeHooks({ config, ledger, rawStore: store, recordedHistoryParts, log }),
  }
}

export default ContextDensityPlugin

async function safeLog(
  client: Parameters<Plugin>[0] extends never ? never : any,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  error?: unknown,
): Promise<void> {
  try {
    await client.app.log({
      body: {
        service: "opencode-context-density",
        level,
        message,
        extra: error ? { error: error instanceof Error ? error.message : String(error) } : undefined,
      },
    })
  } catch {
    // Logging must never interfere with the agent execution loop.
  }
}
