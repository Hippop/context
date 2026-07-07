import { spawn } from "node:child_process"

const opencode = process.env.OPENCODE_BIN ?? "opencode"
const model = process.env.OPENCODE_MODEL ?? "opencode/mimo-v2.5-free"
const timeoutMs = Number(process.env.OPENCODE_TIMEOUT ?? 90_000)
const child = spawn(
  opencode,
  [
    "run",
    "--auto",
    "--format",
    "json",
    "--model",
    model,
    "Call the context_report tool, then reply with only its first line.",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
)
let stdout = ""
let stderr = ""
let timedOut = false
child.stdout.on("data", (chunk) => (stdout += String(chunk)))
child.stderr.on("data", (chunk) => (stderr += String(chunk)))
const timer = setTimeout(() => {
  timedOut = true
  child.kill("SIGTERM")
  setTimeout(() => child.kill("SIGKILL"), 2_000).unref()
}, timeoutMs)
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
const report = events.find(
  (event) => event.type === "tool_use" && event.part?.tool === "context_report" && event.part?.state?.status === "completed",
)
const answer = events.filter((event) => event.type === "text").map((event) => event.part?.text).join("\n")
const success = exitCode === 0 && !timedOut && Boolean(report) && answer.includes("Context Density Report")
const result = {
  success,
  exitCode,
  timedOut,
  model,
  sessionID: events.find((event) => event.sessionID)?.sessionID,
  tool: report?.part?.tool,
  reportFirstLine: String(report?.part?.state?.output ?? "").split("\n")[0],
  answer,
  stderr,
}
console.log(JSON.stringify(result, null, 2))
if (!success) process.exitCode = 1
