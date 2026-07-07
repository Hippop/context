import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContextDensityPlugin } from "../src/index.js"

const cleanup: string[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("OpenCode plugin integration", () => {
  it("exposes tools and compresses a native bash result through the public hook", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-density-plugin-"))
    const cache = await mkdtemp(path.join(os.tmpdir(), "context-density-cache-"))
    cleanup.push(root, cache)
    const hooks = await ContextDensityPlugin(
      {
        worktree: root,
        directory: root,
        client: { app: { log: vi.fn(async () => ({})) } },
      } as never,
      {
        shell: { minChars: 0, minSavingsRatio: 0 },
        rawStore: { directory: cache },
      },
    )
    expect(hooks.tool?.token_save_read).toBeTruthy()
    expect(hooks.tool?.context_raw).toBeTruthy()
    expect(hooks.tool?.context_report).toBeTruthy()

    const output = {
      title: "pytest",
      output: Array.from({ length: 100 }, (_, index) => `test_${index} PASSED`).join("\n"),
      metadata: {},
    }
    await hooks["tool.execute.after"]?.(
      { tool: "bash", sessionID: "session-1", callID: "call-1", args: { command: "pytest" } },
      output,
    )
    expect(output.output).toContain("passing-test lines folded")
    expect(output.output).toContain("raw id")
    expect((output.metadata as { contextDensity?: unknown }).contextDensity).toBeTruthy()
    const rawID = (output.metadata as { contextDensity: { rawID: string } }).contextDensity.rawID
    const restored = await hooks.tool!.context_raw.execute(
      { id: rawID },
      toolContext(root, "session-1"),
    )
    expect(restored).toContain("test_0 PASSED")
    expect(restored).toContain("test_99 PASSED")
  })

  it("makes exploratory reads explicit and asks for OpenCode read permission", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-density-read-"))
    const cache = await mkdtemp(path.join(os.tmpdir(), "context-density-cache-"))
    cleanup.push(root, cache)
    const target = path.join(root, "large.ts")
    await writeFile(
      target,
      `/* Copyright 2026 Example - MIT License */\n${Array.from({ length: 30 }, (_, index) => `export const value${index} = ${index}\n\n\n`).join("")}`,
    )
    const hooks = await ContextDensityPlugin(
      {
        worktree: root,
        directory: root,
        client: { app: { log: vi.fn(async () => ({})) } },
      } as never,
      { rawStore: { directory: cache } },
    )
    const ask = vi.fn(async () => undefined)
    const result = await hooks.tool!.token_save_read.execute(
      { filePath: target },
      { ...toolContext(root, "session-1"), ask },
    )
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ permission: "read" }))
    expect(typeof result).toBe("object")
    expect((result as { output: string }).output).toContain('exploratory="true"')
    expect((result as { output: string }).output).not.toContain('mode="undefined"')
    expect((result as { output: string }).output).toContain("use native read")
  })

  it("fails open when the configured raw store cannot be written", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "context-density-fail-open-"))
    cleanup.push(root)
    const hooks = await ContextDensityPlugin(
      {
        worktree: root,
        directory: root,
        client: { app: { log: vi.fn(async () => ({})) } },
      } as never,
      { shell: { minChars: 0, minSavingsRatio: 0 }, rawStore: { directory: "/proc/context-density-denied" } },
    )
    const raw = Array.from({ length: 100 }, (_, index) => `test_${index} PASSED`).join("\n")
    const output = { title: "pytest", output: raw, metadata: {} }
    await hooks["tool.execute.after"]?.(
      { tool: "bash", sessionID: "session-1", callID: "call-1", args: { command: "pytest" } },
      output,
    )
    expect(output.output).toBe(raw)
  })
})

function toolContext(root: string, sessionID: string) {
  return {
    sessionID,
    messageID: "message-1",
    agent: "build",
    directory: root,
    worktree: root,
    abort: new AbortController().signal,
    metadata: vi.fn(),
    ask: vi.fn(async () => undefined),
  }
}
