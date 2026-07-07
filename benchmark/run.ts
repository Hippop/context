import { performance } from "node:perf_hooks"
import { DEFAULT_CONFIG } from "../src/config.js"
import { compressReadContent } from "../src/compressors/read.js"
import { compressShellOutput } from "../src/compressors/shell.js"
import { transformHistory } from "../src/history.js"
import { MetricsLedger } from "../src/metrics.js"
import { estimateTokens } from "../src/token-estimator.js"
import type { CompressionResult } from "../src/types.js"

interface BenchmarkCase {
  name: string
  category: string
  input: string
  criticalFacts: string[]
  run(input: string): CompressionResult
}

const iterations = Number(process.env.BENCH_ITERATIONS ?? 100)
const contextLimit = Number(process.env.CONTEXT_LIMIT ?? 128_000)

const cases: BenchmarkCase[] = [
  shellCase(
    "ut-pytest",
    "UT",
    "pytest",
    [
      ...Array.from({ length: 600 }, (_, index) => `tests/test_user.py::test_case_${index} PASSED`),
      "tests/test_payment.py::test_decline FAILED",
      "AssertionError: expected 402, got 200",
      "599 passed, 1 failed in 12.4s",
    ].join("\n"),
    ["test_payment.py::test_decline FAILED", "AssertionError: expected 402", "599 passed, 1 failed"],
  ),
  shellCase(
    "ft-playwright",
    "FT",
    "pnpm test",
    [
      ...Array.from({ length: 400 }, (_, index) => `✓ browser flow ${index} PASSED`),
      "✗ checkout should reject an expired card FAILED",
      "Expected status 402 but received 200",
      "400 passed, 1 failed",
    ].join("\n"),
    ["expired card FAILED", "Expected status 402", "400 passed, 1 failed"],
  ),
  shellCase(
    "component-build",
    "build",
    "cargo build",
    [
      ...Array.from({ length: 500 }, (_, index) => `Compiling dependency-${index} v1.2.3`),
      "error[E0308]: mismatched types",
      " --> src/main.rs:18:4",
      "build failed",
    ].join("\n"),
    ["error[E0308]", "src/main.rs:18:4", "build failed"],
  ),
  readCase(
    "service-log",
    "log",
    "service.log",
    [
      ...Array.from(
        { length: 1_000 },
        (_, index) =>
          `2026-06-02 14:30:${String(Math.floor(index / 100)).padStart(2, "0")}.${index % 100} [INFO] request ${index} status ok`,
      ),
      "2026-06-02 14:31:00.001 [ERROR] code=E_SENTINEL file=src/cache.ts",
    ].join("\n"),
    ["E_SENTINEL", "src/cache.ts"],
  ),
  readCase("skill", "instruction", ".opencode/skills/std-req-executor/SKILL.md", instructionFixture(), [
    "MUST NOT publish secrets",
    "MUST run verification",
  ]),
  readCase("command", "instruction", ".opencode/commands/module-design.md", instructionFixture(), [
    "$ARGUMENTS",
    "MUST NOT publish secrets",
  ]),
  readCase("agent", "instruction", ".opencode/agents/dev-master.md", instructionFixture(), [
    "permission:",
    "MUST run verification",
  ]),
  readCase("agents-md", "instruction", "AGENTS.md", instructionFixture(), [
    "MUST NOT publish secrets",
    "MUST run verification",
  ]),
  readCase("design-doc", "docs", "RDC0002_design.md", markdownFixture(), ["Decision D-17", "portRate", "rollback"]),
  readCase("c-code", "code", "code.c", codeFixture("c"), ["#define RETRY_LIMIT", "int update_rate"]),
  readCase("cpp-code", "code", "xverse.cpp", codeFixture("cpp"), ["template <typename T>", "class RateUpdater"]),
  readCase("java-code", "code", "WhisperCppTest.java", codeFixture("java"), ["@Test", "void rejectsExpiredRate"]),
  readCase("python-code", "code", "code.py", codeFixture("python"), ["@retry", "def update_rate"]),
  readCase("json-table", "json", "fixkey_table.json", jsonFixture(), ["E_RARE", "worker-199", "false"]),
  readCase("xml-model", "xml", "model.xml", xmlFixture(), ['id="port-199"', "<rate>1199</rate>"]),
  historyCase(),
]

const results = cases.map((item) => {
  const warm = item.run(item.input)
  const timings: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    item.run(item.input)
    timings.push(performance.now() - started)
  }
  timings.sort((a, b) => a - b)
  const rawTurns = Math.floor(contextLimit / Math.max(1, warm.originalTokens))
  const compressedTurns = Math.floor(contextLimit / Math.max(1, warm.compressedTokens))
  return {
    case: item.name,
    category: item.category,
    applied: warm.applied,
    rawTokens: warm.originalTokens,
    compressedTokens: warm.compressedTokens,
    savedPercent: round(((warm.originalTokens - warm.compressedTokens) / Math.max(1, warm.originalTokens)) * 100, 1),
    criticalRecall: round(
      item.criticalFacts.filter((fact) => warm.text.includes(fact)).length / Math.max(1, item.criticalFacts.length),
      3,
    ),
    latencyP50Ms: round(percentile(timings, 0.5), 3),
    latencyP95Ms: round(percentile(timings, 0.95), 3),
    turnsBeforeContextRaw: rawTurns,
    turnsBeforeContextCompressed: compressedTurns,
    persistenceMultiplier: round(compressedTurns / Math.max(1, rawTurns), 2),
  }
})

console.table(results)
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), iterations, contextLimit, results }, null, 2))

function shellCase(name: string, category: string, command: string, input: string, criticalFacts: string[]): BenchmarkCase {
  return {
    name,
    category,
    input,
    criticalFacts,
    run(value) {
      return compressShellOutput(command, value, shellOptions())
    },
  }
}

function readCase(name: string, category: string, filePath: string, input: string, criticalFacts: string[]): BenchmarkCase {
  return {
    name,
    category,
    input,
    criticalFacts,
    run(value) {
      return compressReadContent(filePath, value, "auto", 0.01)
    },
  }
}

function historyCase(): BenchmarkCase {
  const repeated = "resolved shell output line\n".repeat(300)
  const input = JSON.stringify([
    { parts: [toolPart("old", repeated)] },
    { parts: [toolPart("latest", repeated)] },
    { parts: [errorPart("error-old")] },
    { parts: [errorPart("error-new")] },
  ])
  return {
    name: "long-history",
    category: "history",
    input,
    criticalFacts: ["identical to later call", "TypeError: sentinel failure"],
    run(value) {
      const messages = JSON.parse(value)
      const started = performance.now()
      transformHistory(
        messages,
        { ...DEFAULT_CONFIG.history, minChars: 100, keepRecentToolOutputs: 0 },
        new MetricsLedger(),
        new Set(),
      )
      const text = JSON.stringify(messages)
      return makeResult(value, text, ["history-dedup", "error-digest"], performance.now() - started)
    },
  }
}

function makeResult(original: string, text: string, stages: string[], elapsedMs: number): CompressionResult {
  const originalTokens = estimateTokens(original)
  const compressedTokens = estimateTokens(text)
  return {
    text,
    applied: text !== original,
    stages,
    originalChars: original.length,
    compressedChars: text.length,
    originalTokens,
    compressedTokens,
    elapsedMs,
  }
}

function toolPart(id: string, output: string) {
  return { type: "tool", id, callID: `call-${id}`, sessionID: "bench", tool: "bash", state: { status: "completed", output } }
}

function errorPart(id: string) {
  return {
    type: "tool",
    id,
    callID: `call-${id}`,
    sessionID: "bench",
    tool: "bash",
    state: { status: "error", error: "TypeError: sentinel failure\n at src/main.ts:42:1\n at node_modules/pkg/a.js:1:1" },
  }
}

function instructionFixture(): string {
  const duplicates = Array.from({ length: 100 }, () => "- MUST run verification before completion.").join("\n")
  return `---\ndescription: Executes standard requirements with $ARGUMENTS\npermission:\n  edit: allow\n---\n<!-- generated navigation -->\n${duplicates}\n- MUST NOT publish secrets.\n- MUST publish release notes.\n`
}

function markdownFixture(): string {
  return `# Port-rate topology design\n\n<!-- generated toc -->\nDecision D-17: update portRate atomically.\n\n| field       | behavior |\n| :---------- | -------: |\n| portRate    | update   |\n| rollback    | required |\n${"\n\n".repeat(100)}## Rollback\nrollback must restore the previous topology.\n`
}

function codeFixture(language: "c" | "cpp" | "java" | "python"): string {
  const license = language === "python" ? "# Copyright 2026 Example\n# MIT License" : "/* Copyright 2026 Example - MIT License */"
  if (language === "c") return `${license}\n#define RETRY_LIMIT 3\n${longDoc()}\nint update_rate(int port, int rate) {\n                return port + rate;\n}\n`
  if (language === "cpp") return `${license}\ntemplate <typename T>\nclass RateUpdater { public: T update(T value) { return value; } };\n${longDoc()}\n`
  if (language === "java") return `${license}\npublic class WhisperCppTest {\n${longDoc()}\n    @Test\n    void rejectsExpiredRate() { assertTrue(true); }\n}\n`
  return `${license}\n\ndef retry(fn):\n    return fn\n\n@retry\ndef update_rate(port: int, rate: int) -> int:\n                \"\"\"Runtime-visible documentation.\"\"\"\n                return port + rate\n`
}

function longDoc(): string {
  return `/**\n * Generated API documentation.\n * Repeated explanation.\n * Repeated explanation.\n * @param value input\n * @returns output\n */`
}

function jsonFixture(): string {
  return JSON.stringify(
    Array.from({ length: 200 }, (_, index) => ({
      id: index,
      name: `worker-${index}`,
      status: index === 177 ? "E_RARE" : "ok",
      active: index !== 199,
    })),
    null,
    2,
  )
}

function xmlFixture(): string {
  return `<model>\n${Array.from({ length: 200 }, (_, index) => `  <port id="port-${index}">\n    <rate>${1000 + index}</rate>\n  </port>`).join("\n")}\n</model>`
}

function shellOptions() {
  return { minChars: 0, minSavingsRatio: 0.01, preserveVerbose: true, skipSecretLikeOutput: true }
}

function percentile(values: number[], quantile: number): number {
  return values[Math.min(values.length - 1, Math.floor(values.length * quantile))] ?? 0
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
