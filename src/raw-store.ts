import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { DensityConfig } from "./types.js"

export interface RawMetadata {
  command?: string
  tool: string
  createdAt: string
  chars: number
}

export class RawStore {
  readonly root: string
  private available = true

  constructor(
    worktree: string,
    private readonly config: DensityConfig["rawStore"],
  ) {
    const project = createHash("sha256").update(worktree).digest("hex").slice(0, 16)
    this.root = config.directory
      ? path.resolve(config.directory)
      : path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "opencode-context-density", project)
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) return
    try {
      if (isVirtualFilesystemPath(this.root)) {
        throw new Error(`Raw observation store cannot use virtual filesystem path: ${this.root}`)
      }
      await mkdir(this.root, { recursive: true })
      await this.cleanupExpired()
      this.available = true
    } catch (error) {
      this.available = false
      throw error
    }
  }

  async save(sessionID: string, text: string, metadata: Omit<RawMetadata, "createdAt" | "chars">): Promise<string | undefined> {
    if (!this.config.enabled || !this.available || Buffer.byteLength(text) > this.config.maxBytesPerSession) return undefined
    const directory = this.sessionDirectory(sessionID)
    await mkdir(directory, { recursive: true })
    await this.pruneToBudget(directory, Buffer.byteLength(text))
    const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
    await Promise.all([
      writeFile(path.join(directory, `${id}.txt`), text, { mode: 0o600 }),
      writeFile(
        path.join(directory, `${id}.json`),
        JSON.stringify({ ...metadata, createdAt: new Date().toISOString(), chars: text.length } satisfies RawMetadata),
        { mode: 0o600 },
      ),
    ])
    return id
  }

  async read(sessionID: string, id: string): Promise<{ text: string; metadata?: RawMetadata }> {
    if (!/^[a-z0-9-]{8,80}$/i.test(id)) throw new Error("Invalid raw observation id")
    const directory = this.sessionDirectory(sessionID)
    const text = await readFile(path.join(directory, `${id}.txt`), "utf8")
    let metadata: RawMetadata | undefined
    try {
      metadata = JSON.parse(await readFile(path.join(directory, `${id}.json`), "utf8")) as RawMetadata
    } catch {
      // The raw text is still recoverable if its sidecar was removed.
    }
    return { text, metadata }
  }

  private sessionDirectory(sessionID: string): string {
    const safe = createHash("sha256").update(sessionID).digest("hex").slice(0, 20)
    return path.join(this.root, safe)
  }

  private async pruneToBudget(directory: string, incomingBytes: number): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".txt"),
    )
    const files = await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(directory, entry.name)
        const info = await stat(filePath)
        return { filePath, id: entry.name.slice(0, -4), size: info.size, mtimeMs: info.mtimeMs }
      }),
    )
    let total = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (total + incomingBytes <= this.config.maxBytesPerSession) break
      await Promise.all([
        rm(file.filePath, { force: true }),
        rm(path.join(directory, `${file.id}.json`), { force: true }),
      ])
      total -= file.size
    }
  }

  private async cleanupExpired(): Promise<void> {
    const cutoff = Date.now() - this.config.ttlHours * 60 * 60 * 1000
    const sessions = await readdir(this.root, { withFileTypes: true })
    await Promise.all(
      sessions
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const target = path.join(this.root, entry.name)
          const info = await stat(target)
          if (info.mtimeMs < cutoff) await rm(target, { recursive: true, force: true })
        }),
    )
  }
}

function isVirtualFilesystemPath(target: string): boolean {
  const normalized = path.resolve(target)
  return normalized === "/proc" || normalized.startsWith("/proc/") || normalized === "/sys" || normalized.startsWith("/sys/") || normalized === "/dev" || normalized.startsWith("/dev/")
}
