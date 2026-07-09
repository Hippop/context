import { spawn } from "node:child_process"
import type { AgentResult, AgentTask, RndConfig } from "./types.js"

export interface AgentAdapter {
  run(task: AgentTask): Promise<AgentResult>
}

export class OpenCodeAgentAdapter implements AgentAdapter {
  constructor(private readonly config: Pick<RndConfig, "opencodeCommand" | "model" | "autoApprove" | "dryRun">) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const prompt = buildPrompt(task)
    if (this.config.dryRun) {
      return {
        engine: "opencode",
        role: task.role,
        exitCode: 0,
        stdout: dryRunOutput(task),
        stderr: "",
        durationMs: 0,
        dryRun: true,
      }
    }

    const started = performance.now()
    const args = ["run", "--dir", task.repo, "--format", "json", "--agent", task.opencodeAgent ?? "build"]
    if (this.config.model) args.push("--model", this.config.model)
    if (this.config.autoApprove) args.push("--auto")
    args.push(prompt)
    const result = await spawnCollect(this.config.opencodeCommand, args)
    return {
      engine: "opencode",
      role: task.role,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Math.round(performance.now() - started),
      dryRun: false,
    }
  }
}

function buildPrompt(task: AgentTask): string {
  return [
    `你是 AI 原生研发系统中的 ${task.role}。`,
    `Run: ${task.runId}`,
    `Stage: ${task.stageId}`,
    "",
    "必须遵守：",
    "- 以 DDD / ADR / BDD / Contract / Testing 的证据链推进。",
    "- 不要削弱需求、验收、契约或测试来迎合实现。",
    "- 输出必须说明产物、假设、验证命令和剩余风险。",
    "",
    "阶段任务：",
    task.prompt,
    "",
    "上下文：",
    task.context || "(无上游产物)",
  ].join("\n")
}

function dryRunOutput(task: AgentTask): string {
  return JSON.stringify(
    {
      dry_run: true,
      engine: "opencode",
      role: task.role,
      stage: task.stageId,
      summary: "OpenCode dispatch was skipped because dry-run mode is enabled.",
      expected_action: task.prompt,
    },
    null,
    2,
  )
}

async function spawnCollect(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (error) => {
      resolve({ exitCode: 127, stdout: "", stderr: error.message })
    })
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") })
    })
  })
}
