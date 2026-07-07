import { describe, expect, it } from "vitest"
import { MetricsLedger } from "../src/metrics.js"

describe("metrics ledger", () => {
  it("reports savings, latency, kind, and compactions", () => {
    const ledger = new MetricsLedger()
    ledger.record("s", "shell", {
      originalChars: 400,
      compressedChars: 100,
      originalTokens: 100,
      compressedTokens: 25,
      elapsedMs: 2,
      stages: ["test-pass-fold"],
    })
    ledger.compacted("s")
    const report = ledger.snapshot("s")
    expect(report.savedTokens).toBe(75)
    expect(report.savingsRatio).toBe(0.75)
    expect(report.compactCount).toBe(1)
    expect(report.byKind.shell.calls).toBe(1)
  })
})
