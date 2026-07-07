import { performance } from "node:perf_hooks"
import { containsLikelySecret } from "../compressors/common.js"
import { finishCompression } from "../compressors/result.js"
import { classifyReadMode, type ReadMode } from "../compressors/read.js"
import { estimateTokens } from "../token-estimator.js"
import type { DensityConfig } from "../types.js"
import type {
  CompressionContract,
  CompressionInput,
  Compressor,
  ContentKind,
  ContentProfile,
  PipelineCompression,
  PipelineDependencies,
} from "./context-object.js"
import type { MetricInput } from "./ports.js"
import { createDefaultRegistry, selectCompressor } from "./registry.js"

export interface ReadPipelineRequest {
  filePath: string
  text: string
  requestedMode: ReadMode
  config: DensityConfig["read"]
  registry?: Compressor[]
}

export interface ShellPipelineRequest {
  sessionID: string
  tool: string
  command: string
  output: string
  deps: PipelineDependencies
  registry?: Compressor[]
}

export function compressReadThroughPipeline(request: ReadPipelineRequest) {
  const kind = classifyReadMode(request.filePath, request.requestedMode)
  const profile: ContentProfile = {
    source: "read",
    kind: readKind(kind),
    filePath: request.filePath,
  }
  const contract: CompressionContract = {
    fidelity: "exploratory",
    minSavingsRatio: request.config.minSavingsRatio,
    requireRawStore: false,
    skipSecretLikeOutput: false,
    metricKind: "read",
  }
  const result = runRegisteredCompressor(request.registry ?? createDefaultRegistry(), {
    profile,
    text: request.text,
    contract,
  })
  return { ...result, mode: kind }
}

export async function compressShellThroughPipeline(request: ShellPipelineRequest): Promise<PipelineCompression | undefined> {
  const { deps } = request
  const config = deps.config
  if (!config.shell.enabled || !config.shell.tools.includes(request.tool.toLowerCase())) return undefined
  if (request.output.length < config.shell.minChars) return undefined

  const profile: ContentProfile = {
    source: "shell",
    kind: "shell",
    tool: request.tool,
    command: request.command,
    sessionID: request.sessionID,
  }
  const contract: CompressionContract = {
    fidelity: "edit-safe",
    minSavingsRatio: config.shell.minSavingsRatio,
    requireRawStore: config.rawStore.enabled,
    skipSecretLikeOutput: config.security.skipSecretLikeOutput,
    preserveVerbose: config.shell.preserveVerbose,
    metricKind: "shell",
  }

  if (contract.skipSecretLikeOutput && containsLikelySecret(request.output)) return undefined

  const result = runRegisteredCompressor(request.registry ?? createDefaultRegistry(), {
    profile,
    text: request.output,
    contract,
  })
  if (!result.applied) return undefined

  let rawID: string | undefined
  try {
    rawID = await deps.rawStore.save(request.sessionID, request.output, { tool: request.tool, command: request.command })
  } catch (error) {
    await deps.logger?.log("warn", "Failed to persist a raw observation; preserving the original output", error)
    if (contract.requireRawStore) return undefined
  }
  if (contract.requireRawStore && !rawID) return undefined

  const marker = rawID
    ? `[context-density: ~${result.originalTokens}→~${result.compressedTokens} tokens; raw id ${rawID}; use context_raw to recover]`
    : `[context-density: ~${result.originalTokens}→~${result.compressedTokens} estimated tokens]`
  const text = `${marker}\n${result.text}`
  const wrappedTokens = estimateTokens(text)
  const wrappedRatio = (result.originalTokens - wrappedTokens) / Math.max(1, result.originalTokens)
  if (wrappedRatio < contract.minSavingsRatio) return undefined

  deps.metrics.record(request.sessionID, "shell", metricFrom(result, marker.length + 1))
  return { text, result, rawID, marker }
}

export function runRegisteredCompressor(registry: Compressor[], input: CompressionInput) {
  const compressor = selectCompressor(registry, input.profile)
  if (!compressor) {
    return finishCompression(input.text, input.text, [], performance.now(), input.contract.minSavingsRatio, "no compressor registered")
  }
  try {
    return compressor.compress(input)
  } catch (error) {
    return finishCompression(
      input.text,
      input.text,
      [],
      performance.now(),
      input.contract.minSavingsRatio,
      `compressor ${compressor.id} failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function metricFrom(
  result: {
    originalChars: number
    compressedChars: number
    originalTokens: number
    compressedTokens: number
    elapsedMs: number
    stages: string[]
  },
  wrapperChars: number,
): MetricInput {
  const wrapperTokens = estimateTokens("x".repeat(wrapperChars))
  return {
    originalChars: result.originalChars,
    compressedChars: result.compressedChars + wrapperChars,
    originalTokens: result.originalTokens,
    compressedTokens: result.compressedTokens + wrapperTokens,
    elapsedMs: result.elapsedMs,
    stages: result.stages,
  }
}

export function readKind(mode: Exclude<ReadMode, "auto">): ContentKind {
  if (mode === "raw") return "raw"
  return mode
}
