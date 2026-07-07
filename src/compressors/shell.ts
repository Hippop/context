import { performance } from "node:perf_hooks"
import type { CompressionResult } from "../types.js"
import {
  collapseBlankLines,
  containsLikelySecret,
  foldConsecutiveDuplicateLines,
  foldExternalStackFrames,
  foldMatchingLines,
  foldLogTemplateRuns,
  foldTimestampedLogs,
  keepFinalProgressFrames,
  stripAnsi,
} from "./common.js"
import { finishCompression } from "./result.js"

export interface ShellCompressionOptions {
  minChars: number
  minSavingsRatio: number
  preserveVerbose: boolean
  skipSecretLikeOutput: boolean
}

export function compressShellOutput(
  command: string,
  original: string,
  options: ShellCompressionOptions,
): CompressionResult {
  const startedAt = performance.now()
  if (original.length < options.minChars) {
    return finishCompression(original, original, [], startedAt, options.minSavingsRatio, "output below minChars")
  }
  if (options.skipSecretLikeOutput && containsLikelySecret(original)) {
    return finishCompression(original, original, [], startedAt, options.minSavingsRatio, "secret-like output preserved")
  }

  let text = original
  const stages: string[] = []
  text = apply(text, stripAnsi, "ansi-strip", stages)
  text = apply(text, keepFinalProgressFrames, "progress-final-frame", stages)

  const verbose = /(?:^|\s)(?:--verbose|--debug|--trace|-vv+)(?:\s|$)/.test(command)
  if (!(verbose && options.preserveVerbose)) {
    if (isTestCommand(command)) {
      text = apply(text, foldPassingTests, "test-pass-fold", stages)
    }
    if (isBuildCommand(command)) {
      text = apply(text, foldBuildProgress, "build-progress-fold", stages)
    }
    if (isLogCommand(command)) {
      text = apply(text, foldLogTemplateRuns, "log-template-fold", stages)
      text = apply(text, foldTimestampedLogs, "log-prefix-fold", stages)
    }
  }

  text = apply(text, foldExternalStackFrames, "external-stack-fold", stages)
  text = apply(text, foldConsecutiveDuplicateLines, "duplicate-line-fold", stages)
  text = apply(text, collapseBlankLines, "blank-line-collapse", stages)
  return finishCompression(original, text, stages, startedAt, options.minSavingsRatio)
}

function apply(text: string, stage: (value: string) => string, name: string, stages: string[]): string {
  const next = stage(text)
  if (next !== text) stages.push(name)
  return next
}

function isTestCommand(command: string): boolean {
  return /(?:^|\s)(?:pytest|vitest|jest|mocha|phpunit|cargo\s+test|go\s+test|mvn(?:w)?\s+test|gradle(?:w)?\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test)(?:\s|$)/i.test(
    command,
  )
}

function isBuildCommand(command: string): boolean {
  return /(?:^|\s)(?:cargo\s+(?:build|check)|mvn(?:w)?\s+(?:package|install|compile)|gradle(?:w)?\s+(?:build|assemble)|npm\s+(?:run\s+)?build|pnpm\s+(?:run\s+)?build|yarn\s+build|go\s+build)(?:\s|$)/i.test(
    command,
  )
}

function isLogCommand(command: string): boolean {
  return /(?:docker|kubectl)\s+logs|(?:^|[;&|]\s*)tail\s|journalctl/.test(command)
}

function foldPassingTests(text: string): string {
  const passPattern = /^(?:\s*(?:PASS\b|✓|✔)|.*\bPASSED\b|\s*--- PASS:|\s*test\s+\S+\s+\.\.\.\s+ok\s*$)/i
  return foldMatchingLines(text, (line) => passPattern.test(line) && !/fail|error/i.test(line), (count) => {
    return `[${count} passing-test lines folded; failures and summaries preserved]`
  })
}

function foldBuildProgress(text: string): string {
  const progressPattern = /^\s*(?:Compiling|Building|Downloading|Downloaded|Bundling|Transpiling|Generating)\s+\S+/i
  return foldMatchingLines(text, (line) => progressPattern.test(line), (count) => `[${count} build progress lines folded]`)
}
