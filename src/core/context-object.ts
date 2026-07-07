import type { CompressionKind, CompressionResult, DensityConfig } from "../types.js"
import type { LoggerPort, MetricsSink, RawObservationWriter } from "./ports.js"

export type ContextSource = "read" | "shell" | "history" | "compaction"
export type ContentKind = "code" | "instruction" | "markdown" | "json" | "xml" | "log" | "shell" | "history" | "raw"
export type FidelityLevel = "exact" | "edit-safe" | "exploratory" | "summary"

export interface ContentProfile {
  source: ContextSource
  kind: ContentKind
  filePath?: string
  command?: string
  tool?: string
  language?: string
  sessionID?: string
}

export interface CompressionContract {
  fidelity: FidelityLevel
  minSavingsRatio: number
  requireRawStore: boolean
  skipSecretLikeOutput: boolean
  preserveVerbose?: boolean
  metricKind: CompressionKind
}

export interface CompressionInput {
  profile: ContentProfile
  text: string
  contract: CompressionContract
}

export interface Compressor {
  id: string
  supports(profile: ContentProfile): boolean
  compress(input: CompressionInput): CompressionResult
}

export interface PipelineDependencies {
  config: DensityConfig
  metrics: MetricsSink
  rawStore: RawObservationWriter
  logger?: LoggerPort
}

export interface PipelineCompression {
  text: string
  result: CompressionResult
  rawID?: string
  marker?: string
}
