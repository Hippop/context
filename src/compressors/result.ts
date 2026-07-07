import { performance } from "node:perf_hooks"
import { estimateTokens } from "../token-estimator.js"
import type { CompressionResult } from "../types.js"

export function finishCompression(
  original: string,
  text: string,
  stages: string[],
  startedAt: number,
  minSavingsRatio: number,
  reason?: string,
): CompressionResult {
  const originalTokens = estimateTokens(original)
  const compressedTokens = estimateTokens(text)
  const ratio = originalTokens === 0 ? 0 : (originalTokens - compressedTokens) / originalTokens
  const applied = text !== original && ratio >= minSavingsRatio
  return {
    text: applied ? text : original,
    applied,
    stages: applied ? stages : [],
    originalChars: original.length,
    compressedChars: applied ? text.length : original.length,
    originalTokens,
    compressedTokens: applied ? compressedTokens : originalTokens,
    elapsedMs: performance.now() - startedAt,
    reason: applied ? undefined : reason ?? `savings ${(ratio * 100).toFixed(1)}% below threshold`,
  }
}
