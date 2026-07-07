import type { DensityConfig, DensityOptions } from "./types.js"

export const DEFAULT_CONFIG: DensityConfig = {
  shell: {
    enabled: true,
    tools: ["bash", "shell"],
    minChars: 1_000,
    minSavingsRatio: 0.12,
    preserveVerbose: true,
  },
  read: {
    maxBytes: 2_000_000,
    defaultLimit: 1_200,
    minSavingsRatio: 0.05,
  },
  history: {
    enabled: true,
    minChars: 1_500,
    keepRecentToolOutputs: 8,
    duplicateTools: ["bash", "shell", "grep", "glob", "webfetch", "websearch", "token_save_read"],
  },
  rawStore: {
    enabled: true,
    maxBytesPerSession: 50 * 1024 * 1024,
    ttlHours: 7 * 24,
  },
  security: {
    skipSecretLikeOutput: true,
  },
  compaction: {
    enabled: true,
  },
}

export function resolveConfig(options: DensityOptions | undefined): DensityConfig {
  const config: DensityConfig = {
    shell: { ...DEFAULT_CONFIG.shell, ...options?.shell },
    read: { ...DEFAULT_CONFIG.read, ...options?.read },
    history: { ...DEFAULT_CONFIG.history, ...options?.history },
    rawStore: { ...DEFAULT_CONFIG.rawStore, ...options?.rawStore },
    security: { ...DEFAULT_CONFIG.security, ...options?.security },
    compaction: { ...DEFAULT_CONFIG.compaction, ...options?.compaction },
  }

  config.shell.minChars = nonNegative(config.shell.minChars, DEFAULT_CONFIG.shell.minChars)
  config.shell.minSavingsRatio = ratio(config.shell.minSavingsRatio, DEFAULT_CONFIG.shell.minSavingsRatio)
  config.read.maxBytes = positive(config.read.maxBytes, DEFAULT_CONFIG.read.maxBytes)
  config.read.defaultLimit = positive(config.read.defaultLimit, DEFAULT_CONFIG.read.defaultLimit)
  config.read.minSavingsRatio = ratio(config.read.minSavingsRatio, DEFAULT_CONFIG.read.minSavingsRatio)
  config.history.minChars = nonNegative(config.history.minChars, DEFAULT_CONFIG.history.minChars)
  config.history.keepRecentToolOutputs = nonNegative(
    config.history.keepRecentToolOutputs,
    DEFAULT_CONFIG.history.keepRecentToolOutputs,
  )
  config.rawStore.maxBytesPerSession = positive(
    config.rawStore.maxBytesPerSession,
    DEFAULT_CONFIG.rawStore.maxBytesPerSession,
  )
  config.rawStore.ttlHours = positive(config.rawStore.ttlHours, DEFAULT_CONFIG.rawStore.ttlHours)
  config.shell.tools = uniqueStrings(config.shell.tools, DEFAULT_CONFIG.shell.tools)
  config.history.duplicateTools = uniqueStrings(config.history.duplicateTools, DEFAULT_CONFIG.history.duplicateTools)
  return config
}

function ratio(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(0.95, value)) : fallback
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function nonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function uniqueStrings(value: string[], fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
}
