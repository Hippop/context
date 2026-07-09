export type RunStatus = "CREATED" | "RUNNING" | "DONE" | "BLOCKED" | "CANCELLED"
export type StageStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "SKIPPED"
export type ArtifactStatus = "draft" | "validated" | "approved" | "superseded"
export type ArtifactType =
  | "goal_contract"
  | "repository_map"
  | "domain_model"
  | "adr"
  | "bdd"
  | "contract"
  | "implementation_result"
  | "test_matrix"
  | "execution_result"
  | "failure_diagnosis"
  | "review_result"
  | "final_report"
  | "agent_output"

export type FailureType =
  | "IMPLEMENTATION_ERROR"
  | "TEST_DEFECT"
  | "CONTRACT_ERROR"
  | "ENVIRONMENT_ERROR"
  | "POLICY_VIOLATION"
  | "HARNESS_DEFECT"
  | "UNKNOWN"

export interface RndConfig {
  repo: string
  requirement: string
  requirementPath?: string
  runsDir: string
  workflowPath?: string
  environment: string
  defaultAgentEngine: "opencode"
  opencodeCommand: string
  model?: string
  autoApprove: boolean
  dryRun: boolean
}

export interface WorkflowSpec {
  id: string
  version: number
  stages: StageSpec[]
}

export type StageSpec = AgentStageSpec | DiscoveryStageSpec | VerificationLoopStageSpec | ReportStageSpec

export interface BaseStageSpec {
  id: string
  name?: string
}

export interface AgentStageSpec extends BaseStageSpec {
  type: "agent"
  agent: string
  opencodeAgent?: string
  outputs: ArtifactType[]
  prompt: string
  inputs?: ArtifactType[]
  validators?: string[]
}

export interface DiscoveryStageSpec extends BaseStageSpec {
  type: "repository_discovery"
}

export interface VerificationLoopStageSpec extends BaseStageSpec {
  type: "verification_loop"
  agent: string
  opencodeAgent?: string
  commands: string[]
  maxIterations: number
  noProgressWindow: number
}

export interface ReportStageSpec extends BaseStageSpec {
  type: "report"
}

export interface RunRecord {
  runId: string
  status: RunStatus
  workflowId: string
  repo: string
  environment: string
  requirementPath?: string
  requirementSummary: string
  defaultAgentEngine: "opencode"
  createdAt: string
  updatedAt: string
  stages: StageRecord[]
  artifacts: ArtifactRef[]
  evidence: EvidenceRef[]
  terminalReason?: string
}

export interface StageRecord {
  id: string
  type: StageSpec["type"]
  status: StageStatus
  startedAt?: string
  endedAt?: string
  attempts: number
  artifactIds: string[]
  evidenceIds: string[]
  failureType?: FailureType
  message?: string
}

export interface ArtifactRef {
  artifactId: string
  runId: string
  type: ArtifactType
  version: number
  status: ArtifactStatus
  createdBy: { kind: "agent" | "tool" | "human"; id: string }
  inputs: string[]
  contentUri: string
  schemaVersion: "1.0"
  validation: { status: "pending" | "passed" | "failed"; evidenceIds: string[] }
  createdAt: string
}

export interface EvidenceRef {
  evidenceId: string
  runId: string
  type: "agent_run" | "command" | "report"
  stageId: string
  contentUri: string
  exitCode?: number
  durationMs: number
  createdAt: string
}

export interface AgentTask {
  runId: string
  stageId: string
  role: string
  opencodeAgent?: string
  repo: string
  prompt: string
  context: string
}

export interface AgentResult {
  engine: "opencode"
  role: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  dryRun: boolean
}

export interface CommandResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}
