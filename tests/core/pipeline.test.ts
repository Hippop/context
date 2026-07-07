import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { finishCompression } from "../../src/compressors/result.js"
import { DEFAULT_CONFIG } from "../../src/config.js"
import type { Compressor } from "../../src/core/context-object.js"
import { compressReadThroughPipeline, compressShellThroughPipeline, runRegisteredCompressor } from "../../src/core/pipeline.js"
import { MetricsLedger } from "../../src/metrics.js"
import { RawStore } from "../../src/raw-store.js"

const cleanup: string[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("core compression pipeline", () => {
  it("routes read objects through a registry compressor", () => {
    const registry: Compressor[] = [
      {
        id: "test.read",
        supports: (profile) => profile.source === "read" && profile.kind === "markdown",
        compress: (input) => finishCompression(input.text, "compressed markdown", ["test-stage"], performance.now(), 0),
      },
    ]

    const result = compressReadThroughPipeline({
      filePath: "README.md",
      text: "# Title\n\nbody",
      requestedMode: "auto",
      config: { ...DEFAULT_CONFIG.read, minSavingsRatio: 0 },
      registry,
    })

    expect(result.applied).toBe(true)
    expect(result.mode).toBe("markdown")
    expect(result.text).toBe("compressed markdown")
    expect(result.stages).toEqual(["test-stage"])
  })

  it("fails open when a registered compressor throws", () => {
    const result = runRegisteredCompressor(
      [
        {
          id: "broken",
          supports: () => true,
          compress: () => {
            throw new Error("boom")
          },
        },
      ],
      {
        profile: { source: "read", kind: "raw" },
        text: "keep me",
        contract: {
          fidelity: "exploratory",
          minSavingsRatio: 0,
          requireRawStore: false,
          skipSecretLikeOutput: false,
          metricKind: "read",
        },
      },
    )

    expect(result.applied).toBe(false)
    expect(result.text).toBe("keep me")
    expect(result.reason).toContain("broken")
  })

  it("stores raw shell output before returning a lossy compressed view", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-density-core-"))
    const cache = await mkdtemp(path.join(os.tmpdir(), "context-density-core-cache-"))
    cleanup.push(root, cache)
    const ledger = new MetricsLedger()
    const rawStore = new RawStore(root, { ...DEFAULT_CONFIG.rawStore, directory: cache })
    await rawStore.initialize()
    const log = vi.fn(async () => undefined)
    const output = Array.from({ length: 100 }, (_, index) => `test_${index} PASSED`).join("\n")

    const compressed = await compressShellThroughPipeline({
      sessionID: "session-core",
      tool: "bash",
      command: "pytest",
      output,
      deps: {
        config: {
          ...DEFAULT_CONFIG,
          shell: { ...DEFAULT_CONFIG.shell, minChars: 0, minSavingsRatio: 0 },
          rawStore: { ...DEFAULT_CONFIG.rawStore, directory: cache },
        },
        metrics: ledger,
        rawStore,
        logger: { log },
      },
    })

    expect(compressed?.text).toContain("raw id")
    expect(compressed?.text).toContain("passing-test lines folded")
    expect(compressed?.rawID).toBeTruthy()
    await expect(rawStore.read("session-core", compressed!.rawID!)).resolves.toMatchObject({ text: output })
    expect(ledger.snapshot("session-core").calls).toBe(1)
  })

  it("does not compress secret-like shell output or write it to raw store", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-density-secret-"))
    const cache = await mkdtemp(path.join(os.tmpdir(), "context-density-secret-cache-"))
    cleanup.push(root, cache)
    const rawStore = new RawStore(root, { ...DEFAULT_CONFIG.rawStore, directory: cache })
    await rawStore.initialize()
    const save = vi.spyOn(rawStore, "save")

    const compressed = await compressShellThroughPipeline({
      sessionID: "session-secret",
      tool: "bash",
      command: "env",
      output: `${"line\n".repeat(100)}api_key=sk-super-secret-value-1234567890`,
      deps: {
        config: { ...DEFAULT_CONFIG, shell: { ...DEFAULT_CONFIG.shell, minChars: 0, minSavingsRatio: 0 } },
        metrics: new MetricsLedger(),
        rawStore,
      },
    })

    expect(compressed).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
  })
})
