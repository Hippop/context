import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ArtifactRef, ArtifactStatus, ArtifactType, EvidenceRef, RunRecord } from "./types.js"

export class ArtifactStore {
  readonly runDir: string
  private artifactCounters = new Map<ArtifactType, number>()
  private evidenceCounter = 0

  constructor(
    private readonly runsDir: string,
    readonly runId: string,
  ) {
    this.runDir = path.join(runsDir, runId)
  }

  async initialize(): Promise<void> {
    await mkdir(path.join(this.runDir, "artifacts"), { recursive: true })
    await mkdir(path.join(this.runDir, "evidence"), { recursive: true })
  }

  async writeRun(record: RunRecord): Promise<void> {
    await writeJson(path.join(this.runDir, "run.json"), record)
  }

  async readRun(): Promise<RunRecord> {
    return JSON.parse(await readFile(path.join(this.runDir, "run.json"), "utf8")) as RunRecord
  }

  async writeArtifact(params: {
    runId: string
    type: ArtifactType
    content: unknown
    createdBy: ArtifactRef["createdBy"]
    inputs?: string[]
    status?: ArtifactStatus
    evidenceIds?: string[]
  }): Promise<ArtifactRef> {
    const version = (this.artifactCounters.get(params.type) ?? 0) + 1
    this.artifactCounters.set(params.type, version)
    const artifactId = `ART-${params.type}-${String(version).padStart(3, "0")}`
    const filename = `${artifactId}.json`
    const contentPath = path.join(this.runDir, "artifacts", filename)
    await writeJson(contentPath, params.content)
    return {
      artifactId,
      runId: params.runId,
      type: params.type,
      version,
      status: params.status ?? "draft",
      createdBy: params.createdBy,
      inputs: params.inputs ?? [],
      contentUri: path.relative(this.runDir, contentPath),
      schemaVersion: "1.0",
      validation: { status: params.evidenceIds?.length ? "passed" : "pending", evidenceIds: params.evidenceIds ?? [] },
      createdAt: new Date().toISOString(),
    }
  }

  async readArtifact(ref: ArtifactRef): Promise<unknown> {
    return JSON.parse(await readFile(path.join(this.runDir, ref.contentUri), "utf8"))
  }

  async writeEvidence(params: {
    runId: string
    type: EvidenceRef["type"]
    stageId: string
    content: unknown
    exitCode?: number
    durationMs: number
  }): Promise<EvidenceRef> {
    const evidenceId = `EVD-${String(++this.evidenceCounter).padStart(4, "0")}`
    const contentPath = path.join(this.runDir, "evidence", `${evidenceId}.json`)
    await writeJson(contentPath, params.content)
    return {
      evidenceId,
      runId: params.runId,
      type: params.type,
      stageId: params.stageId,
      contentUri: path.relative(this.runDir, contentPath),
      exitCode: params.exitCode,
      durationMs: params.durationMs,
      createdAt: new Date().toISOString(),
    }
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}
