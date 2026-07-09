import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { OpenCodeAgentAdapter, classifyFailure, runRndSystem } from "../src/index.js"

const cleanup: string[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("AI-native R&D harness", () => {
  it("runs the default workflow in dry-run mode with opencode as the default engine", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "rnd-harness-repo-"))
    const runsDir = await mkdtemp(path.join(os.tmpdir(), "rnd-harness-runs-"))
    cleanup.push(repo, runsDir)

    const record = await runRndSystem({
      repo,
      runsDir,
      requirement: "为登录服务增加短信验证码登录，并保留现有密码登录。",
      dryRun: true,
    })

    expect(record.status).toBe("DONE")
    expect(record.defaultAgentEngine).toBe("opencode")
    expect(record.artifacts.map((artifact) => artifact.type)).toContain("goal_contract")
    expect(record.artifacts.map((artifact) => artifact.type)).toContain("repository_map")
    expect(record.artifacts.map((artifact) => artifact.type)).toContain("final_report")

    const runJson = JSON.parse(await readFile(path.join(runsDir, record.runId, "run.json"), "utf8")) as typeof record
    expect(runJson.workflowId).toBe("feature-delivery")
  })

  it("builds opencode run commands for live agent dispatch", async () => {
    const adapter = new OpenCodeAgentAdapter({
      opencodeCommand: "__missing_opencode_for_test__",
      model: "provider/model",
      autoApprove: true,
      dryRun: false,
    })

    const result = await adapter.run({
      runId: "RUN-test",
      stageId: "implementation",
      role: "code-agent",
      opencodeAgent: "build",
      repo: process.cwd(),
      prompt: "实现功能",
      context: "Goal Contract",
    })

    expect(result.engine).toBe("opencode")
    expect(result.exitCode).toBe(127)
    expect(result.stderr).toContain("__missing_opencode_for_test__")
  })

  it("classifies common verification failures for routing", () => {
    expect(classifyFailure("npm run typecheck", "tsc failed with TypeError")).toBe("IMPLEMENTATION_ERROR")
    expect(classifyFailure("npm test", "AssertionError: expected 200 received 500")).toBe("TEST_DEFECT")
    expect(classifyFailure("npm run contract", "OpenAPI schema breaking change")).toBe("CONTRACT_ERROR")
    expect(classifyFailure("npm run api", "connection refused 127.0.0.1")).toBe("ENVIRONMENT_ERROR")
  })
})
