#!/usr/bin/env node
import path from "node:path"
import { readRun, runRndSystem } from "./orchestrator.js"

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp()
    return
  }
  if (command === "run") {
    const flags = parseFlags(args)
    const repo = flags.repo ?? process.cwd()
    const requirement = flags.requirement
    if (!requirement) throw new Error("Missing --requirement <text-or-file>")
    const record = await runRndSystem({
      repo,
      requirement,
      requirementPath: flags.requirement,
      workflowPath: flags.workflow,
      runsDir: flags.runsDir,
      environment: flags.environment,
      opencodeCommand: flags.opencodeCommand,
      model: flags.model,
      autoApprove: flags.auto === "true" || flags.auto === "",
      dryRun: flags.dryRun === "true" || flags.dryRun === "",
    })
    console.log(JSON.stringify({ runId: record.runId, status: record.status, runsDir: flags.runsDir ?? path.join(path.resolve(repo), ".ai-harness", "runs") }, null, 2))
    return
  }
  if (command === "status" || command === "report") {
    const runId = args.find((arg) => !arg.startsWith("--"))
    if (!runId) throw new Error(`Missing run id for ${command}`)
    const flags = parseFlags(args.filter((arg) => arg !== runId))
    const runsDir = flags.runsDir ?? path.join(process.cwd(), ".ai-harness", "runs")
    const record = await readRun(runsDir, runId)
    if (command === "status") {
      console.log(JSON.stringify({ runId: record.runId, status: record.status, stages: record.stages, terminalReason: record.terminalReason }, null, 2))
    } else {
      const finalReport = record.artifacts.find((artifact) => artifact.type === "final_report")
      console.log(JSON.stringify({ runId: record.runId, status: record.status, finalReport: finalReport?.contentUri, artifacts: record.artifacts, evidence: record.evidence }, null, 2))
    }
    return
  }
  throw new Error(`Unknown command: ${command}`)
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg.startsWith("--")) continue
    const key = toCamel(arg.slice(2))
    const next = args[index + 1]
    if (!next || next.startsWith("--")) {
      flags[key] = ""
    } else {
      flags[key] = next
      index++
    }
  }
  return flags
}

function toCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function printHelp(): void {
  console.log(`ai-sdlc

Commands:
  ai-sdlc run --repo <repo> --requirement <file-or-text> [--workflow <json>] [--dry-run]
  ai-sdlc status <run-id> [--runs-dir <dir>]
  ai-sdlc report <run-id> [--runs-dir <dir>]

Defaults:
  Agent engine: opencode
  OpenCode CLI: opencode run --dir <repo> --format json --agent <stage-agent>
`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
