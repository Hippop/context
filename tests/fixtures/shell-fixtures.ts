import type { ShellCompressionOptions } from "../../src/compressors/shell.js"

export interface ShellFixture {
  name: string
  command: string
  raw: string
  options?: Partial<ShellCompressionOptions>
  shouldApply: boolean
  expectedStages?: string[]
  mustContain: string[]
  mustNotContain?: string[]
  minSavedPercent?: number
}

export const defaultShellFixtureOptions: ShellCompressionOptions = {
  minChars: 0,
  minSavingsRatio: 0,
  preserveVerbose: true,
  skipSecretLikeOutput: true,
}

export const shellFixtures: ShellFixture[] = [
  {
    name: "pytest-passed-fold-preserves-failure",
    command: "pytest",
    raw: [
      ...Array.from({ length: 120 }, (_, index) => `tests/test_user.py::test_case_${index} PASSED`),
      "tests/test_payment.py::test_decline FAILED",
      "AssertionError: expected 402, got 200",
      "120 passed, 1 failed in 2.3s",
    ].join("\n"),
    shouldApply: true,
    expectedStages: ["test-pass-fold"],
    mustContain: [
      "120 passing-test lines folded",
      "tests/test_payment.py::test_decline FAILED",
      "AssertionError: expected 402",
      "120 passed, 1 failed",
    ],
    mustNotContain: ["tests/test_user.py::test_case_119 PASSED"],
    minSavedPercent: 80,
  },
  {
    name: "vitest-checkmark-fold-preserves-summary",
    command: "pnpm test",
    raw: [
      ...Array.from({ length: 80 }, (_, index) => `✓ browser flow ${index} PASSED`),
      "✗ checkout should reject an expired card FAILED",
      "Expected status 402 but received 200",
      "80 passed, 1 failed",
    ].join("\n"),
    shouldApply: true,
    expectedStages: ["test-pass-fold"],
    mustContain: ["80 passing-test lines folded", "expired card FAILED", "Expected status 402", "80 passed, 1 failed"],
    minSavedPercent: 75,
  },
  {
    name: "go-test-pass-fold",
    command: "go test ./...",
    raw: [
      ...Array.from({ length: 40 }, (_, index) => `--- PASS: TestServiceCase${index} (0.00s)`),
      "--- FAIL: TestPaymentDecline (0.02s)",
      "payment_test.go:44: expected 402 got 200",
      "FAIL",
    ].join("\n"),
    shouldApply: true,
    expectedStages: ["test-pass-fold"],
    mustContain: ["40 passing-test lines folded", "--- FAIL: TestPaymentDecline", "payment_test.go:44", "FAIL"],
    minSavedPercent: 65,
  },
  {
    name: "build-progress-fold-preserves-rust-error",
    command: "cargo build",
    raw: [
      ...Array.from({ length: 80 }, (_, index) => `Compiling package-${index} v1.0.0`),
      "error[E0308]: mismatched types",
      "  --> src/main.rs:12:5",
      "build failed",
    ].join("\n"),
    shouldApply: true,
    expectedStages: ["build-progress-fold"],
    mustContain: ["80 build progress lines folded", "error[E0308]", "src/main.rs:12:5", "build failed"],
    mustNotContain: ["Compiling package-79"],
    minSavedPercent: 80,
  },
  {
    name: "progress-carriage-return-final-frame",
    command: "npm install",
    raw: `Downloading 10%\rDownloading 50%\rDownloading 100%\nDone\n${"same\n".repeat(5)}`,
    shouldApply: true,
    expectedStages: ["progress-final-frame", "duplicate-line-fold"],
    mustContain: ["Downloading 100%", "Done", "previous line repeated 4 more times"],
    mustNotContain: ["Downloading 10%", "Downloading 50%"],
    minSavedPercent: 20,
  },
  {
    name: "ansi-strip-and-blank-collapse",
    command: "node script.js",
    raw: `\u001b[31mERROR\u001b[0m failed\n\n\n\n${"same warning\n".repeat(5)}`,
    shouldApply: true,
    expectedStages: ["ansi-strip", "duplicate-line-fold", "blank-line-collapse"],
    mustContain: ["ERROR failed", "same warning", "previous line repeated 4 more times"],
    mustNotContain: ["\u001b[31m"],
    minSavedPercent: 20,
  },
  {
    name: "external-stack-frame-fold",
    command: "node app.js",
    raw: [
      "TypeError: value is undefined",
      "    at src/service.ts:42:10",
      ...Array.from({ length: 12 }, (_, index) => `    at node_modules/pkg-${index}/index.js:1:1`),
      "    at src/main.ts:8:3",
    ].join("\n"),
    shouldApply: true,
    expectedStages: ["external-stack-fold"],
    mustContain: [
      "TypeError: value is undefined",
      "at src/service.ts:42:10",
      "... 12 external stack frame(s) omitted",
      "at src/main.ts:8:3",
    ],
    mustNotContain: ["node_modules/pkg-11"],
    minSavedPercent: 50,
  },
  {
    name: "log-template-fold-preserves-error",
    command: "kubectl logs deployment/api",
    raw: [
      ...Array.from(
        { length: 20 },
        (_, index) => `2026-07-06T12:00:00.${index} INFO worker-${index} processing job ${1000 + index}`,
      ),
      "2026-07-06T12:00:01 ERROR worker-9 failed job 1010",
    ].join("\n"),
    shouldApply: true,
    expectedStages: ["log-template-fold"],
    mustContain: ["[log-template ×20]", "variants:", "ERROR worker-9 failed job 1010"],
    minSavedPercent: 30,
  },
  {
    name: "timestamp-prefix-fold-preserves-warn-error",
    command: "journalctl -u api",
    raw: [
      "2026-07-06 12:00:00.001 [INFO] boot sequence started",
      "2026-07-06 12:00:00.002 [INFO] cache warmed for tenant alpha",
      "2026-07-06 12:00:00.003 [INFO] database pool primary ready",
      "2026-07-06 12:00:00.004 [INFO] http listener bound to port 3000",
      "2026-07-06 12:00:01.001 [WARN] queue depth high",
      "2026-07-06 12:00:02.001 [ERROR] request 42 failed",
    ].join("\n"),
    shouldApply: true,
    expectedStages: ["log-prefix-fold"],
    mustContain: [
      "[2026-07-06 12:00:00 INFO] boot sequence started",
      "↳ cache warmed for tenant alpha",
      "[WARN] queue depth high",
      "[ERROR] request 42 failed",
    ],
    minSavedPercent: 10,
  },
  {
    name: "secret-like-output-fail-open",
    command: "env",
    raw: `${"normal output\n".repeat(100)}api_key=sk-super-secret-value-1234567890`,
    shouldApply: false,
    mustContain: ["api_key=sk-super-secret-value-1234567890"],
  },
  {
    name: "verbose-build-preserved",
    command: "cargo build --verbose",
    raw: Array.from({ length: 20 }, (_, index) => `Compiling package-${index}`).join("\n"),
    options: { minSavingsRatio: 0.01 },
    shouldApply: false,
    mustContain: ["Compiling package-19"],
  },
]
