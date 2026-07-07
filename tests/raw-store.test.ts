import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { RawStore } from "../src/raw-store.js"

const cleanup: string[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("raw observation store", () => {
  it("persists and restores raw output per session", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "context-density-"))
    cleanup.push(directory)
    const store = new RawStore("/project", {
      enabled: true,
      directory,
      maxBytesPerSession: 1_000_000,
      ttlHours: 24,
    })
    await store.initialize()
    const id = await store.save("session-1", "full raw output", { tool: "bash", command: "npm test" })
    expect(id).toBeTruthy()
    const restored = await store.read("session-1", id!)
    expect(restored.text).toBe("full raw output")
    expect(restored.metadata?.command).toBe("npm test")
    await expect(store.read("session-2", id!)).rejects.toThrow()
  })
})
