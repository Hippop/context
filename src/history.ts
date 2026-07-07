import { createHash } from "node:crypto"
import { estimateTokens } from "./token-estimator.js"
import type { DensityConfig } from "./types.js"
import type { MetricsLedger } from "./metrics.js"

interface ToolPartLike {
  id: string
  sessionID: string
  callID: string
  type: "tool"
  tool: string
  state:
    | { status: "completed"; output: string; [key: string]: unknown }
    | { status: "error"; error: string; [key: string]: unknown }
    | { status: string; [key: string]: unknown }
}

interface MessageLike {
  parts: unknown[]
}

type CompletedPart = ToolPartLike & { state: { status: "completed"; output: string; [key: string]: unknown } }
type ErrorPart = ToolPartLike & { state: { status: "error"; error: string; [key: string]: unknown } }

export function transformHistory(
  messages: MessageLike[],
  config: DensityConfig["history"],
  ledger: MetricsLedger,
  recordedParts: Set<string>,
): void {
  if (!config.enabled) return
  const parts = messages.flatMap((message) => message.parts).filter(isToolPart)
  const completed = parts.filter(isCompletedPart)
  const recent = parts.filter((part) => part.state.status === "completed" || part.state.status === "error")
  const protectedIDs = new Set(
    config.keepRecentToolOutputs === 0
      ? []
      : recent.slice(-config.keepRecentToolOutputs).map((part) => part.id),
  )
  const seen = new Map<string, ToolPartLike>()

  for (let index = completed.length - 1; index >= 0; index -= 1) {
    const part = completed[index]
    if (!config.duplicateTools.includes(part.tool) || part.state.output.length < config.minChars) continue
    if (part.state.output.includes("[context-density:")) continue
    const key = digest(`${part.tool}\0${normalize(part.state.output)}`)
    const later = seen.get(key)
    seen.set(key, part)
    if (!later || protectedIDs.has(part.id)) continue
    const original = part.state.output
    part.state.output = `[context-density: duplicate ${part.tool} output omitted; identical to later call ${later.callID}]`
    recordOnce(part, original, part.state.output, "history", ledger, recordedParts, ["duplicate-tool-output"])
  }

  const errors = parts.filter(isErrorPart)
  const groups = new Map<string, ErrorPart[]>()
  for (const part of errors) {
    if (part.state.error.includes("[context-density:")) continue
    const signature = errorSignature(part.state.error)
    const group = groups.get(signature) ?? []
    group.push(part)
    groups.set(signature, group)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const latest = group.at(-1)!
    for (const part of group.slice(0, -1)) {
      if (protectedIDs.has(part.id)) continue
      const original = part.state.error
      part.state.error = formatErrorDigest(original, latest, group.length)
      recordOnce(part, original, part.state.error, "error", ledger, recordedParts, ["repeated-error-digest"])
    }
  }
}

function isToolPart(part: unknown): part is ToolPartLike {
  if (!part || typeof part !== "object") return false
  const value = part as Record<string, unknown>
  return (
    value.type === "tool" &&
    typeof value.id === "string" &&
    typeof value.sessionID === "string" &&
    typeof value.callID === "string" &&
    typeof value.tool === "string" &&
    Boolean(value.state) &&
    typeof value.state === "object"
  )
}

function isCompletedPart(part: ToolPartLike): part is CompletedPart {
  return part.state.status === "completed" && typeof (part.state as { output?: unknown }).output === "string"
}

function isErrorPart(part: ToolPartLike): part is ErrorPart {
  return part.state.status === "error" && typeof (part.state as { error?: unknown }).error === "string"
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd()
}

function errorSignature(value: string): string {
  const meaningful = value
    .split("\n")
    .filter((line) => !/^\s*at\s+/.test(line))
    .slice(0, 3)
    .join(" ")
    .replace(/:\d+:\d+/g, ":<line>")
    .replace(/\s+/g, " ")
  return digest(meaningful)
}

function firstMeaningfulLine(value: string): string {
  return value.split("\n").find((line) => line.trim() && !/^\s*at\s+/.test(line))?.trim() ?? "Unknown error"
}

function formatErrorDigest(original: string, latest: ErrorPart, count: number): string {
  const allFrames = original.split("\n").filter((line) => /^\s*at\s+/.test(line))
  const projectFrames = allFrames.filter((line) => !/(?:node_modules|node:internal|[\\/]effect[\\/]|bun:)/.test(line))
  const externalCount = allFrames.length - projectFrames.length
  return [
    `[context-density: repeated error digest; latest call ${latest.callID}]`,
    `signature: ${firstMeaningfulLine(original)}`,
    `seen_count: ${count}`,
    `project_frames: ${projectFrames.length ? projectFrames.map((line) => line.trim()).join(" | ") : "none"}`,
    `external_frames_omitted: ${externalCount}`,
    "latest full error remains in the protected/recent history.",
  ].join("\n")
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function recordOnce(
  part: ToolPartLike,
  original: string,
  compressed: string,
  kind: "history" | "error",
  ledger: MetricsLedger,
  recordedParts: Set<string>,
  stages: string[],
): void {
  if (recordedParts.has(part.id)) return
  recordedParts.add(part.id)
  ledger.record(part.sessionID, kind, {
    originalChars: original.length,
    compressedChars: compressed.length,
    originalTokens: estimateTokens(original),
    compressedTokens: estimateTokens(compressed),
    elapsedMs: 0,
    stages,
  })
}
