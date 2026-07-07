export type CompressionKind = "shell" | "read" | "history" | "error"

export interface CompressionResult {
  text: string
  applied: boolean
  stages: string[]
  originalChars: number
  compressedChars: number
  originalTokens: number
  compressedTokens: number
  elapsedMs: number
  reason?: string
}

export interface DensityConfig {
  shell: {
    enabled: boolean
    tools: string[]
    minChars: number
    minSavingsRatio: number
    preserveVerbose: boolean
  }
  read: {
    maxBytes: number
    defaultLimit: number
    minSavingsRatio: number
  }
  history: {
    enabled: boolean
    minChars: number
    keepRecentToolOutputs: number
    duplicateTools: string[]
  }
  rawStore: {
    enabled: boolean
    directory?: string
    maxBytesPerSession: number
    ttlHours: number
  }
  security: {
    skipSecretLikeOutput: boolean
  }
  compaction: {
    enabled: boolean
  }
}

export type DensityOptions = Partial<{
  [K in keyof DensityConfig]: Partial<DensityConfig[K]>
}>

export interface MetricRecord {
  kind: CompressionKind
  originalChars: number
  compressedChars: number
  originalTokens: number
  compressedTokens: number
  elapsedMs: number
  stages: string[]
  timestamp: number
}

export interface MetricsSnapshot {
  sessionID: string
  calls: number
  originalChars: number
  compressedChars: number
  originalTokens: number
  compressedTokens: number
  savedTokens: number
  savingsRatio: number
  totalLatencyMs: number
  averageLatencyMs: number
  compactCount: number
  byKind: Record<string, { calls: number; originalTokens: number; compressedTokens: number }>
}
