import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

interface RunResult {
  variant: "baseline" | "treatment"
  run: number
  sessionID?: string
  exitCode: number
  durationMs: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  qualityScore: number
  timedOut: boolean
  errorClassification?: string
  toolCalls: Array<{ tool: string; status: string; outputChars: number; compressionApplied: boolean }>
  answer: string
  stderr: string
}

const args = parseArgs(process.argv.slice(2))
const opencode = args.opencode ?? "opencode"
const rounds = Math.max(1, Number(args.rounds ?? 1))
const runs = Math.max(1, Number(args.runs ?? 1))
const keep = args.keep === "true"
const timeoutMs = Math.max(10_000, Number(args.timeout ?? 120_000))
const here = path.dirname(fileURLToPath(import.meta.url))
const pluginEntry = path.resolve(here, "../dist/index.js")
const outputRoot = path.resolve(here, "results")
const root = await mkdtemp(path.join(os.tmpdir(), "opencode-context-density-ab-"))

if (!(await commandExists(opencode))) {
  console.error(`SKIP: '${opencode}' is not installed or not on PATH. Build the plugin, install OpenCode, then rerun npm run benchmark:ab.`)
  await rm(root, { recursive: true, force: true })
  process.exitCode = 2
} else {
  const all: RunResult[] = []
  try {
    for (let run = 1; run <= runs; run += 1) {
      for (const variant of ["baseline", "treatment"] as const) {
        const workspace = path.join(root, `${variant}-${run}`)
        await createFixture(workspace)
        const config = JSON.stringify({ plugin: variant === "treatment" ? [pluginEntry] : [] })
        let sessionID: string | undefined
        for (let round = 1; round <= rounds; round += 1) {
          const prompt = [
            `Evaluation round ${round}/${rounds}. Inspect fixture.log and report the single ERROR as strict JSON with keys code, file, cause, and confidence.`,
            'If token_save_read exists, call it directly with filePath="fixture.log", mode="log", offset=1, limit=1500. Otherwise use native read on fixture.log.',
            "Do not call token_save_read on a directory. Do not edit files. Do not guess.",
          ].join(" ")
          const command = ["run", "--auto", "--format", "json", "--dir", workspace]
          if (args.model) command.push("--model", args.model)
          if (sessionID) command.push("--session", sessionID)
          command.push(prompt)
          const result = await execute(opencode, command, {
            ...process.env,
            OPENCODE_CONFIG_CONTENT: config,
          }, timeoutMs)
          sessionID = result.sessionID ?? sessionID
          all.push({ ...result, variant, run })
          if (result.exitCode !== 0) break
        }
      }
    }

    const summary = summarize(all)
    await mkdir(outputRoot, { recursive: true })
    const outputFile = path.join(outputRoot, `opencode-ab-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
    await writeFile(outputFile, JSON.stringify({ generatedAt: new Date().toISOString(), rounds, runs, timeoutMs, results: all, summary }, null, 2))
    console.table(summary)
    console.log(`Detailed A/B result: ${outputFile}`)
  } finally {
    if (!keep) await rm(root, { recursive: true, force: true })
    else console.log(`Kept evaluation workspaces: ${root}`)
  }
}

async function createFixture(workspace: string): Promise<void> {
  await mkdir(workspace, { recursive: true })
  const lines = Array.from({ length: 1_500 }, (_, index) => {
    if (index === 917) {
      return "2026-07-06 12:00:09.917 [ERROR] code=E_DENSITY_7319 file=src/cache.ts cause=stale-generation-counter"
    }
    return `2026-07-06 12:00:${String(Math.floor(index / 100)).padStart(2, "0")}.${String(index % 100).padStart(3, "0")} [INFO] request=${index} status=ok`
  })
  await writeFile(path.join(workspace, "fixture.log"), lines.join("\n"))
}

async function execute(
  command: string,
  commandArgs: string[],
  env: NodeJS.ProcessEnv,
  timeout: number,
): Promise<Omit<RunResult, "variant" | "run">> {
  const started = Date.now()
  const child = spawn(command, commandArgs, { env, stdio: ["ignore", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  let timedOut = false
  child.stdout.on("data", (chunk) => (stdout += String(chunk)))
  child.stderr.on("data", (chunk) => (stderr += String(chunk)))
  const timer = setTimeout(() => {
    timedOut = true
    child.kill("SIGTERM")
    setTimeout(() => child.kill("SIGKILL"), 2_000).unref()
  }, timeout)
  const exitCode = await new Promise<number>((resolve) => child.on("close", (code) => resolve(code ?? 124)))
  clearTimeout(timer)
  const events = stdout
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, any>]
      } catch {
        return []
      }
    })
  const text = events.filter((event) => event.type === "text").map((event) => String(event.part?.text ?? "")).join("\n")
  const totals = events
    .filter((event) => event.type === "step_finish")
    .reduce(
      (sum, event) => {
        const tokens = event.part?.tokens ?? {}
        sum.input += Number(tokens.input ?? 0)
        sum.output += Number(tokens.output ?? 0)
        sum.reasoning += Number(tokens.reasoning ?? 0)
        sum.cacheRead += Number(tokens.cache?.read ?? 0)
        sum.cacheWrite += Number(tokens.cache?.write ?? 0)
        return sum
      },
      { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    )
  const sessionID = events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined
  const toolCalls = events
    .filter((event) => event.type === "tool_use")
    .map((event) => {
      const part = event.part ?? {}
      const state = part.state ?? {}
      return {
        tool: String(part.tool ?? "unknown"),
        status: String(state.status ?? "unknown"),
        outputChars: String(state.output ?? "").length,
        compressionApplied: Boolean(state.metadata?.contextDensity?.applied),
      }
    })
  const eventErrors = events.filter((event) => event.type === "error").map((event) => JSON.stringify(event.error)).join("\n")
  const errorClassification = classifyFailure(`${stderr}\n${eventErrors}`, timedOut)
  const expected = ["E_DENSITY_7319", "src/cache.ts", "stale-generation-counter"]
  return {
    sessionID,
    exitCode,
    durationMs: Date.now() - started,
    inputTokens: totals.input,
    outputTokens: totals.output,
    reasoningTokens: totals.reasoning,
    cacheReadTokens: totals.cacheRead,
    cacheWriteTokens: totals.cacheWrite,
    qualityScore: expected.filter((needle) => text.includes(needle)).length / expected.length,
    timedOut,
    errorClassification,
    toolCalls,
    answer: text,
    stderr,
  }
}

function summarize(results: RunResult[]) {
  return (["baseline", "treatment"] as const).map((variant) => {
    const items = results.filter((item) => item.variant === variant && item.exitCode === 0)
    const mean = (pick: (item: RunResult) => number) =>
      items.length === 0 ? 0 : items.reduce((sum, item) => sum + pick(item), 0) / items.length
    return {
      variant,
      completedRounds: items.length,
      failedRounds: results.filter((item) => item.variant === variant && item.exitCode !== 0).length,
      meanInputTokens: Math.round(mean((item) => item.inputTokens)),
      meanOutputTokens: Math.round(mean((item) => item.outputTokens)),
      meanDurationMs: Math.round(mean((item) => item.durationMs)),
      meanQualityScore: Number(mean((item) => item.qualityScore).toFixed(3)),
    }
  })
}

function classifyFailure(message: string, timedOut: boolean): string | undefined {
  if (timedOut) return "timeout"
  if (/Bad Gateway|502/i.test(message)) return "provider_bad_gateway"
  if (/rate.?limit|429/i.test(message)) return "provider_rate_limit"
  if (/auth|credential|unauthorized|401/i.test(message)) return "authentication"
  return message.trim() ? "opencode_or_provider_error" : undefined
}

async function commandExists(command: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const child = spawn(command, ["--version"], { stdio: "ignore" })
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith("--")) continue
    const [rawKey, inline] = value.slice(2).split("=", 2)
    if (inline !== undefined) result[rawKey] = inline
    else if (values[index + 1] && !values[index + 1].startsWith("--")) result[rawKey] = values[++index]
    else result[rawKey] = "true"
  }
  return result
}
