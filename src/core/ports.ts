import type { CompressionKind, MetricRecord } from "../types.js"

export type MetricInput = Omit<MetricRecord, "kind" | "timestamp">

export interface MetricsSink {
  record(sessionID: string, kind: CompressionKind, record: MetricInput): void
}

export interface RawObservationWriter {
  save(sessionID: string, text: string, metadata?: Record<string, unknown>): Promise<string | undefined>
}

export interface LoggerPort {
  log(level: "debug" | "info" | "warn" | "error", message: string, error?: unknown): Promise<void>
}
