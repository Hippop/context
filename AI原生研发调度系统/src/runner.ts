import { spawn } from "node:child_process"
import type { CommandResult, FailureType } from "./types.js"

export async function runCommand(command: string, cwd: string): Promise<CommandResult> {
  const started = performance.now()
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (error) => {
      resolve({
        command,
        exitCode: 127,
        stdout: "",
        stderr: error.message,
        durationMs: Math.round(performance.now() - started),
      })
    })
    child.on("close", (code) => {
      resolve({
        command,
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: Math.round(performance.now() - started),
      })
    })
  })
}

export function classifyFailure(command: string, output: string): FailureType {
  const text = `${command}\n${output}`.toLowerCase()
  if (/permission denied|not allowed|policy|unsafe|forbidden/.test(text)) return "POLICY_VIOLATION"
  if (/eaddrinuse|connection refused|enoent|command not found|could not resolve|network|timeout|timed out/.test(text)) {
    return "ENVIRONMENT_ERROR"
  }
  if (/openapi|pact|schema|contract|ajv|breaking change/.test(text)) return "CONTRACT_ERROR"
  if (/assert|expected|received|snapshot|fixture|mock|test failed|failing tests?/.test(text)) return "TEST_DEFECT"
  if (/tsc|typescript|compile|syntaxerror|typeerror|referenceerror|build failed|lint/.test(text)) return "IMPLEMENTATION_ERROR"
  return "UNKNOWN"
}
