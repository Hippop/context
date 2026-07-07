import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../src/config.js"
import { transformHistory } from "../src/history.js"
import { MetricsLedger } from "../src/metrics.js"

function completed(id: string, output: string) {
  return {
    type: "tool" as const,
    id,
    callID: `call-${id}`,
    sessionID: "session-1",
    tool: "bash",
    state: { status: "completed" as const, output },
  }
}

describe("history transform", () => {
  it("replaces only older duplicate outputs", () => {
    const repeated = "large result\n".repeat(200)
    const first = completed("1", repeated)
    const latest = completed("2", repeated)
    const messages = [{ parts: [first] }, { parts: [latest] }]
    transformHistory(
      messages,
      { ...DEFAULT_CONFIG.history, keepRecentToolOutputs: 0, minChars: 10 },
      new MetricsLedger(),
      new Set(),
    )
    expect(first.state.output).toContain("duplicate bash output omitted")
    expect(latest.state.output).toBe(repeated)
  })

  it("protects the configured recent output window", () => {
    const repeated = "large result\n".repeat(200)
    const first = completed("1", repeated)
    const latest = completed("2", repeated)
    transformHistory(
      [{ parts: [first] }, { parts: [latest] }],
      { ...DEFAULT_CONFIG.history, keepRecentToolOutputs: 2, minChars: 10 },
      new MetricsLedger(),
      new Set(),
    )
    expect(first.state.output).toBe(repeated)
    expect(latest.state.output).toBe(repeated)
  })

  it("deduplicates repeated old errors by signature", () => {
    const makeError = (id: string, line: number) => ({
      type: "tool" as const,
      id,
      callID: `call-${id}`,
      sessionID: "session-1",
      tool: "bash",
      state: { status: "error" as const, error: `TypeError: value is undefined\n    at src/a.ts:${line}:2\n    at node_modules/x/a.js:2:1` },
    })
    const first = makeError("1", 10)
    const latest = makeError("2", 20)
    transformHistory(
      [{ parts: [first] }, { parts: [latest] }],
      { ...DEFAULT_CONFIG.history, keepRecentToolOutputs: 0 },
      new MetricsLedger(),
      new Set(),
    )
    expect(first.state.error).toContain("repeated error digest")
    expect(first.state.error).toContain("seen_count: 2")
    expect(first.state.error).toContain("src/a.ts:10:2")
    expect(first.state.error).toContain("external_frames_omitted: 1")
    expect(latest.state.error).toContain("node_modules")
  })
})
