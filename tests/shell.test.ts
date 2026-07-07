import { describe, expect, it } from "vitest"
import { compressShellOutput } from "../src/compressors/shell.js"

const options = {
  minChars: 0,
  minSavingsRatio: 0,
  preserveVerbose: true,
  skipSecretLikeOutput: true,
}

describe("shell compression", () => {
  it("folds passing tests but preserves failures and the final summary", () => {
    const passes = Array.from({ length: 120 }, (_, index) => `test_user_${index} PASSED`).join("\n")
    const raw = `${passes}\ntest_payment FAILED\nAssertionError: expected 2, received 3\n120 passed, 1 failed in 2.3s`
    const result = compressShellOutput("pytest", raw, options)

    expect(result.applied).toBe(true)
    expect(result.text).toContain("120 passing-test lines folded")
    expect(result.text).toContain("test_payment FAILED")
    expect(result.text).toContain("AssertionError")
    expect(result.text).toContain("120 passed, 1 failed")
    expect(result.compressedTokens).toBeLessThan(result.originalTokens)
  })

  it("folds build progress and keeps errors", () => {
    const raw = [
      ...Array.from({ length: 80 }, (_, index) => `Compiling package-${index} v1.0.0`),
      "error[E0308]: mismatched types",
      "  --> src/main.rs:12:5",
      "build failed",
    ].join("\n")
    const result = compressShellOutput("cargo build", raw, options)
    expect(result.text).toContain("80 build progress lines folded")
    expect(result.text).toContain("error[E0308]")
  })

  it("keeps only the final carriage-return progress frame", () => {
    const raw = `Downloading 10%\rDownloading 50%\rDownloading 100%\nDone\n${"same\n".repeat(5)}`
    const result = compressShellOutput("npm install", raw, options)
    expect(result.text).not.toContain("10%")
    expect(result.text).toContain("100%")
  })

  it("fails open when output looks secret-bearing", () => {
    const raw = `${"normal output\n".repeat(100)}api_key=sk-super-secret-value-1234567890`
    const result = compressShellOutput("env", raw, options)
    expect(result.applied).toBe(false)
    expect(result.text).toBe(raw)
    expect(result.reason).toContain("secret-like")
  })

  it("preserves verbose command output except generic lossless cleanup", () => {
    const raw = Array.from({ length: 20 }, (_, index) => `Compiling package-${index}`).join("\n")
    const result = compressShellOutput("cargo build --verbose", raw, { ...options, minSavingsRatio: 0.01 })
    expect(result.text).toBe(raw)
    expect(result.applied).toBe(false)
  })

  it("uses a template and variant table for repeated logs while preserving errors", () => {
    const info = Array.from(
      { length: 20 },
      (_, index) => `2026-07-06T12:00:00.${index} INFO worker-${index} processing job ${1000 + index}`,
    ).join("\n")
    const raw = `${info}\n2026-07-06T12:00:01 ERROR worker-9 failed job 1010`
    const result = compressShellOutput("kubectl logs deployment/api", raw, options)
    expect(result.text).toContain("[log-template ×20]")
    expect(result.text).toContain("variants:")
    expect(result.text).toContain("ERROR worker-9 failed job 1010")
  })
})
