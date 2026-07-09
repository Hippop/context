import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { ArtifactStore } from "./artifact-store.js"
import type { AgentAdapter } from "./agent-adapter.js"
import { OpenCodeAgentAdapter } from "./agent-adapter.js"
import { discoverRepository } from "./repository.js"
import { classifyFailure, runCommand } from "./runner.js"
import type { AgentStageSpec, ArtifactRef, RndConfig, RunRecord, StageRecord, StageSpec, VerificationLoopStageSpec } from "./types.js"
import { loadWorkflow } from "./workflows.js"

export interface RunOptions {
  repo: string
  requirement: string
  requirementPath?: string
  runsDir?: string
  workflowPath?: string
  environment?: string
  opencodeCommand?: string
  model?: string
  autoApprove?: boolean
  dryRun?: boolean
  agentAdapter?: AgentAdapter
}

export async function runRndSystem(options: RunOptions): Promise<RunRecord> {
  const repo = path.resolve(options.repo)
  const requirement = await resolveRequirement(options.requirement)
  const config: RndConfig = {
    repo,
    requirement,
    requirementPath: options.requirementPath,
    runsDir: path.resolve(options.runsDir ?? path.join(repo, ".ai-harness", "runs")),
    workflowPath: options.workflowPath,
    environment: options.environment ?? "dev",
    defaultAgentEngine: "opencode",
    opencodeCommand: options.opencodeCommand ?? "opencode",
    model: options.model,
    autoApprove: options.autoApprove ?? false,
    dryRun: options.dryRun ?? false,
  }
  await mkdir(config.runsDir, { recursive: true })
  const workflow = await loadWorkflow(config.workflowPath)
  const runId = createRunId()
  const store = new ArtifactStore(config.runsDir, runId)
  await store.initialize()
  const now = new Date().toISOString()
  const record: RunRecord = {
    runId,
    status: "CREATED",
    workflowId: workflow.id,
    repo,
    environment: config.environment,
    requirementPath: config.requirementPath,
    requirementSummary: summarize(requirement),
    defaultAgentEngine: "opencode",
    createdAt: now,
    updatedAt: now,
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      type: stage.type,
      status: "PENDING",
      attempts: 0,
      artifactIds: [],
      evidenceIds: [],
    })),
    artifacts: [],
    evidence: [],
  }
  await store.writeRun(record)
  const adapter = options.agentAdapter ?? new OpenCodeAgentAdapter(config)
  record.status = "RUNNING"
  await store.writeRun(touch(record))

  for (const stage of workflow.stages) {
    const stageRecord = record.stages.find((item) => item.id === stage.id)
    if (!stageRecord) continue
    await runStage({ stage, stageRecord, record, store, adapter, config })
    await store.writeRun(touch(record))
    if (stageRecord.status === "FAILED") {
      record.status = "BLOCKED"
      record.terminalReason = stageRecord.message
      await store.writeRun(touch(record))
      return record
    }
  }

  record.status = "DONE"
  await store.writeRun(touch(record))
  return record
}

export async function readRun(runsDir: string, runId: string): Promise<RunRecord> {
  const store = new ArtifactStore(path.resolve(runsDir), runId)
  return store.readRun()
}

async function runStage(params: {
  stage: StageSpec
  stageRecord: StageRecord
  record: RunRecord
  store: ArtifactStore
  adapter: AgentAdapter
  config: RndConfig
}): Promise<void> {
  const { stage, stageRecord, record, store, adapter, config } = params
  stageRecord.status = "RUNNING"
  stageRecord.startedAt = new Date().toISOString()
  stageRecord.attempts += 1
  if (stage.type === "agent") await runAgentStage(stage, record, stageRecord, store, adapter, config)
  if (stage.type === "repository_discovery") await runDiscoveryStage(record, stageRecord, store, config)
  if (stage.type === "verification_loop") await runVerificationLoop(stage, record, stageRecord, store, adapter, config)
  if (stage.type === "report") await runReportStage(record, stageRecord, store)
  stageRecord.endedAt = new Date().toISOString()
}

async function runAgentStage(
  stage: AgentStageSpec,
  record: RunRecord,
  stageRecord: StageRecord,
  store: ArtifactStore,
  adapter: AgentAdapter,
  config: RndConfig,
): Promise<void> {
  const inputRefs = selectArtifacts(record.artifacts, stage.inputs)
  const result = await adapter.run({
    runId: record.runId,
    stageId: stage.id,
    role: stage.agent,
    opencodeAgent: stage.opencodeAgent,
    repo: config.repo,
    prompt: `${stage.prompt}\n\n原始需求：\n${config.requirement}`,
    context: await renderArtifactContext(store, inputRefs),
  })
  const evidence = await store.writeEvidence({
    runId: record.runId,
    type: "agent_run",
    stageId: stage.id,
    content: result,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
  })
  record.evidence.push(evidence)
  stageRecord.evidenceIds.push(evidence.evidenceId)
  if (result.exitCode !== 0) {
    stageRecord.status = "FAILED"
    stageRecord.failureType = "HARNESS_DEFECT"
    stageRecord.message = `Agent ${stage.agent} failed: ${result.stderr || result.stdout}`
    return
  }
  for (const output of stage.outputs) {
    const artifact = await store.writeArtifact({
      runId: record.runId,
      type: output,
      createdBy: { kind: "agent", id: stage.agent },
      inputs: inputRefs.map((ref) => ref.artifactId),
      evidenceIds: [evidence.evidenceId],
      content: { stage: stage.id, agent: stage.agent, engine: result.engine, output: result.stdout },
    })
    record.artifacts.push(artifact)
    stageRecord.artifactIds.push(artifact.artifactId)
  }
  stageRecord.status = "PASSED"
}

async function runDiscoveryStage(record: RunRecord, stageRecord: StageRecord, store: ArtifactStore, config: RndConfig): Promise<void> {
  const repositoryMap = await discoverRepository(config.repo)
  const artifact = await store.writeArtifact({
    runId: record.runId,
    type: "repository_map",
    createdBy: { kind: "tool", id: "repository-discovery" },
    status: "validated",
    content: repositoryMap,
  })
  record.artifacts.push(artifact)
  stageRecord.artifactIds.push(artifact.artifactId)
  stageRecord.status = "PASSED"
}

async function runVerificationLoop(
  stage: VerificationLoopStageSpec,
  record: RunRecord,
  stageRecord: StageRecord,
  store: ArtifactStore,
  adapter: AgentAdapter,
  config: RndConfig,
): Promise<void> {
  const signatures: string[] = []
  for (let iteration = 1; iteration <= stage.maxIterations; iteration++) {
    const results = []
    for (const command of stage.commands) {
      const result = config.dryRun ? { command, exitCode: 0, stdout: "dry-run: command skipped", stderr: "", durationMs: 0 } : await runCommand(command, config.repo)
      results.push(result)
      const evidence = await store.writeEvidence({
        runId: record.runId,
        type: "command",
        stageId: stage.id,
        content: result,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      })
      record.evidence.push(evidence)
      stageRecord.evidenceIds.push(evidence.evidenceId)
      if (result.exitCode !== 0) break
    }
    const failed = results.find((item) => item.exitCode !== 0)
    if (!failed) {
      const artifact = await store.writeArtifact({
        runId: record.runId,
        type: "execution_result",
        createdBy: { kind: "tool", id: "local-runner" },
        status: "validated",
        evidenceIds: stageRecord.evidenceIds,
        content: { iteration, status: "passed", commands: results },
      })
      record.artifacts.push(artifact)
      stageRecord.artifactIds.push(artifact.artifactId)
      stageRecord.status = "PASSED"
      return
    }

    const failureType = classifyFailure(failed.command, `${failed.stdout}\n${failed.stderr}`)
    stageRecord.failureType = failureType
    const signature = `${failureType}:${failed.command}:${firstLine(failed.stderr || failed.stdout)}`
    signatures.push(signature)
    const diagnosis = await store.writeArtifact({
      runId: record.runId,
      type: "failure_diagnosis",
      createdBy: { kind: "tool", id: "failure-classifier" },
      content: { iteration, failureType, failedCommand: failed.command, signature, route: routeFor(failureType) },
    })
    record.artifacts.push(diagnosis)
    stageRecord.artifactIds.push(diagnosis.artifactId)

    if (hasNoProgress(signatures, stage.noProgressWindow)) {
      stageRecord.status = "FAILED"
      stageRecord.message = `No progress after repeated failure signature: ${signature}`
      return
    }

    const repair = await adapter.run({
      runId: record.runId,
      stageId: `${stage.id}:repair:${iteration}`,
      role: stage.agent,
      opencodeAgent: stage.opencodeAgent,
      repo: config.repo,
      prompt: `验证失败，请按最小修复原则处理。失败类型：${failureType}。失败命令：${failed.command}。不要削弱验收、契约或测试意图。`,
      context: JSON.stringify({ failed, diagnosis }, null, 2),
    })
    const repairEvidence = await store.writeEvidence({
      runId: record.runId,
      type: "agent_run",
      stageId: stage.id,
      content: repair,
      exitCode: repair.exitCode,
      durationMs: repair.durationMs,
    })
    record.evidence.push(repairEvidence)
    stageRecord.evidenceIds.push(repairEvidence.evidenceId)
    if (repair.exitCode !== 0) {
      stageRecord.status = "FAILED"
      stageRecord.message = `Repair agent failed: ${repair.stderr || repair.stdout}`
      return
    }
  }
  stageRecord.status = "FAILED"
  stageRecord.message = `Retry budget exhausted after ${stage.maxIterations} iterations`
}

async function runReportStage(record: RunRecord, stageRecord: StageRecord, store: ArtifactStore): Promise<void> {
  const report = {
    runId: record.runId,
    status: record.status,
    summary: record.requirementSummary,
    defaultAgentEngine: record.defaultAgentEngine,
    stageResults: record.stages.map((stage) => ({
      id: stage.id,
      type: stage.type,
      status: stage.status,
      attempts: stage.attempts,
      artifacts: stage.artifactIds,
      evidence: stage.evidenceIds,
      failureType: stage.failureType,
      message: stage.message,
    })),
    artifacts: record.artifacts,
    evidence: record.evidence,
    generatedAt: new Date().toISOString(),
  }
  const evidence = await store.writeEvidence({
    runId: record.runId,
    type: "report",
    stageId: stageRecord.id,
    content: report,
    durationMs: 0,
  })
  record.evidence.push(evidence)
  stageRecord.evidenceIds.push(evidence.evidenceId)
  const artifact = await store.writeArtifact({
    runId: record.runId,
    type: "final_report",
    createdBy: { kind: "tool", id: "report-generator" },
    status: "validated",
    evidenceIds: [evidence.evidenceId],
    content: report,
  })
  record.artifacts.push(artifact)
  stageRecord.artifactIds.push(artifact.artifactId)
  stageRecord.status = "PASSED"
}

async function resolveRequirement(requirement: string): Promise<string> {
  try {
    return await readFile(path.resolve(requirement), "utf8")
  } catch {
    return requirement
  }
}

function selectArtifacts(artifacts: ArtifactRef[], types?: string[]): ArtifactRef[] {
  if (!types?.length) return artifacts
  return artifacts.filter((artifact) => types.includes(artifact.type))
}

async function renderArtifactContext(store: ArtifactStore, refs: ArtifactRef[]): Promise<string> {
  const chunks = []
  for (const ref of refs) {
    chunks.push(`## ${ref.type} ${ref.artifactId}\n${JSON.stringify(await store.readArtifact(ref), null, 2)}`)
  }
  return chunks.join("\n\n")
}

function summarize(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240)
}

function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")
  return `RUN-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function touch(record: RunRecord): RunRecord {
  record.updatedAt = new Date().toISOString()
  return record
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim().slice(0, 160) ?? ""
}

function hasNoProgress(signatures: string[], window: number): boolean {
  if (signatures.length < window) return false
  const recent = signatures.slice(-window)
  return recent.every((signature) => signature === recent[0])
}

function routeFor(failureType: string): string {
  const routes: Record<string, string> = {
    IMPLEMENTATION_ERROR: "code-agent",
    TEST_DEFECT: "unit-test-agent",
    CONTRACT_ERROR: "contract-agent",
    ENVIRONMENT_ERROR: "execution-runner",
    POLICY_VIOLATION: "human-gate",
    HARNESS_DEFECT: "harness-maintainer",
  }
  return routes[failureType] ?? "failure-analyzer"
}
