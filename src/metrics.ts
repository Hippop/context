import type { CompressionKind, MetricRecord, MetricsSnapshot } from "./types.js"

interface SessionMetrics {
  records: MetricRecord[]
  compactCount: number
}

export class MetricsLedger {
  private readonly sessions = new Map<string, SessionMetrics>()

  record(sessionID: string, kind: CompressionKind, record: Omit<MetricRecord, "kind" | "timestamp">): void {
    const metrics = this.ensure(sessionID)
    metrics.records.push({ ...record, kind, timestamp: Date.now() })
  }

  compacted(sessionID: string): void {
    this.ensure(sessionID).compactCount += 1
  }

  remove(sessionID: string): void {
    this.sessions.delete(sessionID)
  }

  snapshot(sessionID: string): MetricsSnapshot {
    const metrics = this.ensure(sessionID)
    const totals = metrics.records.reduce(
      (sum, item) => {
        sum.originalChars += item.originalChars
        sum.compressedChars += item.compressedChars
        sum.originalTokens += item.originalTokens
        sum.compressedTokens += item.compressedTokens
        sum.totalLatencyMs += item.elapsedMs
        const kind = (sum.byKind[item.kind] ??= { calls: 0, originalTokens: 0, compressedTokens: 0 })
        kind.calls += 1
        kind.originalTokens += item.originalTokens
        kind.compressedTokens += item.compressedTokens
        return sum
      },
      {
        originalChars: 0,
        compressedChars: 0,
        originalTokens: 0,
        compressedTokens: 0,
        totalLatencyMs: 0,
        byKind: {} as MetricsSnapshot["byKind"],
      },
    )
    const savedTokens = totals.originalTokens - totals.compressedTokens
    return {
      sessionID,
      calls: metrics.records.length,
      ...totals,
      savedTokens,
      savingsRatio: totals.originalTokens === 0 ? 0 : savedTokens / totals.originalTokens,
      averageLatencyMs: metrics.records.length === 0 ? 0 : totals.totalLatencyMs / metrics.records.length,
      compactCount: metrics.compactCount,
    }
  }

  format(sessionID: string): string {
    const item = this.snapshot(sessionID)
    const kinds = Object.entries(item.byKind)
      .map(([kind, value]) => {
        const saved = value.originalTokens - value.compressedTokens
        const ratio = value.originalTokens === 0 ? 0 : saved / value.originalTokens
        return `- ${kind}: ${value.calls} calls, ~${saved.toLocaleString()} tokens saved (${percent(ratio)})`
      })
      .join("\n")
    return [
      "Context Density Report (provider-neutral token estimates)",
      `- compressed observations: ${item.calls}`,
      `- estimated tokens: ${item.originalTokens.toLocaleString()} → ${item.compressedTokens.toLocaleString()}`,
      `- estimated saved: ${item.savedTokens.toLocaleString()} (${percent(item.savingsRatio)})`,
      `- compressor latency: ${item.totalLatencyMs.toFixed(2)} ms total, ${item.averageLatencyMs.toFixed(2)} ms average`,
      `- OpenCode compactions observed: ${item.compactCount}`,
      kinds || "- no compression has been applied in this session",
    ].join("\n")
  }

  private ensure(sessionID: string): SessionMetrics {
    let value = this.sessions.get(sessionID)
    if (!value) {
      value = { records: [], compactCount: 0 }
      this.sessions.set(sessionID, value)
    }
    return value
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
