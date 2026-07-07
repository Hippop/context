import { performance } from "node:perf_hooks"
import path from "node:path"
import type { CompressionResult } from "../types.js"
import {
  collapseBlankLines,
  foldConsecutiveDuplicateLines,
  foldExternalStackFrames,
  foldLogTemplateRuns,
  foldTimestampedLogs,
  stripAnsi,
} from "./common.js"
import { finishCompression } from "./result.js"
import { compressInstructionMarkdown, compressJsonContent, compressXmlContent } from "./structured.js"

export type ReadMode = "auto" | "code" | "log" | "markdown" | "instruction" | "json" | "xml" | "raw"

const CODE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".hpp", ".html", ".java", ".js", ".jsx", ".kt",
  ".kts", ".lua", ".php", ".py", ".rb", ".rs", ".scala", ".scss", ".sh", ".sql", ".swift", ".ts", ".tsx",
  ".vue", ".zig",
])

export function classifyReadMode(filePath: string, mode: ReadMode): Exclude<ReadMode, "auto"> {
  if (mode !== "auto") return mode
  const extension = path.extname(filePath).toLowerCase()
  const basename = path.basename(filePath).toLowerCase()
  const normalized = filePath.replace(/\\/g, "/").toLowerCase()
  if (
    basename === "agents.md" ||
    basename === "skill.md" ||
    /\/(?:agents|commands|skills)\//.test(normalized)
  )
    return "instruction"
  if ([".log", ".out", ".trace"].includes(extension)) return "log"
  if (extension === ".json") return "json"
  if (extension === ".xml") return "xml"
  if ([".md", ".mdx", ".markdown"].includes(extension)) return "markdown"
  if (CODE_EXTENSIONS.has(extension)) return "code"
  return "raw"
}

export function compressReadContent(
  filePath: string,
  original: string,
  requestedMode: ReadMode,
  minSavingsRatio: number,
): CompressionResult & { mode: Exclude<ReadMode, "auto"> } {
  const startedAt = performance.now()
  const mode = classifyReadMode(filePath, requestedMode)
  let text = original
  const stages: string[] = []

  if (mode === "code") {
    text = apply(text, omitLeadingLicense, "license-header-omit", stages)
    if (!isPythonLike(filePath)) text = apply(text, omitLongDocBlocks, "doc-block-fold", stages)
    if (!isPythonLike(filePath)) text = apply(text, foldLongCodeBodies, "code-body-fold", stages)
    text = apply(text, normalizeCodeIndentation, "indent-normalize", stages)
    text = apply(text, collapseBlankLines, "blank-line-collapse", stages)
  } else if (mode === "log") {
    text = apply(text, stripAnsi, "ansi-strip", stages)
    text = apply(text, foldLogTemplateRuns, "log-template-fold", stages)
    text = apply(text, foldTimestampedLogs, "log-prefix-fold", stages)
    text = apply(text, foldExternalStackFrames, "external-stack-fold", stages)
    text = apply(text, foldConsecutiveDuplicateLines, "duplicate-line-fold", stages)
    text = apply(text, collapseBlankLines, "blank-line-collapse", stages)
  } else if (mode === "markdown") {
    text = apply(text, compressMarkdown, "markdown-structure", stages)
    text = apply(text, collapseBlankLines, "blank-line-collapse", stages)
  } else if (mode === "instruction") {
    const result = compressInstructionMarkdown(original, minSavingsRatio)
    return { ...result, mode }
  } else if (mode === "json") {
    const result = compressJsonContent(original, minSavingsRatio, true)
    return { ...result, mode }
  } else if (mode === "xml") {
    const result = compressXmlContent(original, minSavingsRatio)
    return { ...result, mode }
  }

  return { ...finishCompression(original, text, stages, startedAt, minSavingsRatio), mode }
}

function apply(text: string, stage: (value: string) => string, name: string, stages: string[]): string {
  const next = stage(text)
  if (next !== text) stages.push(name)
  return next
}

function omitLeadingLicense(text: string): string {
  const lines = text.split("\n")
  const first = lines.findIndex((line) => line.trim().length > 0)
  if (first < 0 || first > 5) return text

  if (lines[first].trim().startsWith("/*")) {
    const end = lines.findIndex((line, index) => index >= first && line.includes("*/"))
    if (end >= first && end - first < 100) {
      const block = lines.slice(first, end + 1).join("\n")
      if (/copyright|license|SPDX-License-Identifier/i.test(block)) {
        lines.splice(first, end - first + 1, `/* [license header omitted: ${end - first + 1} lines] */`)
        return lines.join("\n")
      }
    }
  }

  let end = first
  while (end < lines.length && /^\s*(?:#|\/\/)/.test(lines[end])) end += 1
  const block = lines.slice(first, end).join("\n")
  if (end > first && /copyright|license|SPDX-License-Identifier/i.test(block)) {
    lines.splice(first, end - first, `// [license header omitted: ${end - first} lines]`)
    return lines.join("\n")
  }
  return text
}

function omitLongDocBlocks(text: string): string {
  const lines = text.split("\n")
  const output: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\/\*\*/.test(lines[index])) {
      output.push(lines[index])
      continue
    }
    let end = index
    while (end < lines.length && !lines[end].includes("*/")) end += 1
    if (end >= lines.length) {
      output.push(lines[index])
      continue
    }
    const block = lines.slice(index, end + 1).join("\n")
    const count = end - index + 1
    if (count >= 5 && !/@deprecated|TODO|FIXME|SECURITY|@example/i.test(block)) {
      const indent = lines[index].match(/^\s*/)?.[0] ?? ""
      output.push(`${indent}/** [documentation omitted: ${count} lines] */`)
    } else output.push(...lines.slice(index, end + 1))
    index = end
  }
  return output.join("\n")
}

function normalizeCodeIndentation(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^[ \t]+/)
      if (!match) return line
      const columns = match[0].replace(/\t/g, "    ").length
      const compact = "  ".repeat(Math.floor(columns / 4)) + " ".repeat(columns % 4)
      return compact + line.slice(match[0].length)
    })
    .join("\n")
}

function foldLongCodeBodies(text: string): string {
  const lines = text.split("\n")
  const output: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!isFunctionLikeOpening(line)) {
      output.push(line)
      continue
    }
    const end = findMatchingBraceLine(lines, index)
    if (end < 0 || end - index < 12) {
      output.push(line)
      continue
    }
    const body = lines.slice(index + 1, end)
    const important = body
      .map((value) => value.trim())
      .filter((value) => /\b(?:return|throw|await|yield|assert|require)\b|TODO|FIXME|SECURITY/i.test(value))
      .slice(0, 4)
    const indent = line.match(/^\s*/)?.[0] ?? ""
    output.push(line)
    output.push(`${indent}  /* [body folded: ${body.length} lines${important.length ? "; key lines follow" : ""}] */`)
    for (const item of important) output.push(`${indent}  // ${item}`)
    output.push(lines[end])
    index = end
  }
  return output.join("\n")
}

function isFunctionLikeOpening(line: string): boolean {
  if (!line.includes("{")) return false
  if (/^\s*(?:if|for|while|switch|catch|try|else|do)\b/.test(line)) return false
  if (/^\s*(?:class|interface|enum|namespace)\b/.test(line)) return false
  return (
    /\bfunction\s+[$\w]+\s*\([^)]*\)\s*\{/.test(line) ||
    /(?:const|let|var)\s+[$\w]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/.test(line) ||
    /^\s*(?:export\s+)?(?:async\s+)?[$\w]+\s*\([^)]*\)\s*\{/.test(line) ||
    /^\s*(?:public|private|protected|static|final|override|async|\s)+[\w<>\[\], ?]+\s+[$\w]+\s*\([^)]*\)\s*\{/.test(line)
  )
}

function findMatchingBraceLine(lines: string[], start: number): number {
  let depth = 0
  let seenOpening = false
  for (let index = start; index < lines.length; index += 1) {
    const stripped = stripQuotedText(lines[index])
    for (const char of stripped) {
      if (char === "{") {
        depth += 1
        seenOpening = true
      } else if (char === "}") {
        depth -= 1
        if (seenOpening && depth === 0) return index
      }
    }
  }
  return -1
}

function stripQuotedText(line: string): string {
  return line
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
}

function compressMarkdown(text: string): string {
  const lines = text.split("\n")
  const output: string[] = []
  let fenced = false
  let inComment = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) fenced = !fenced
    if (fenced) {
      output.push(line)
      continue
    }
    if (inComment) {
      if (line.includes("-->")) inComment = false
      continue
    }
    if (line.includes("<!--")) {
      if (!line.includes("-->")) inComment = true
      continue
    }
    if (/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line)) continue
    if (line.includes("|")) output.push(line.trim().replace(/\s*\|\s*/g, "|"))
    else output.push(line.replace(/[ \t]+$/g, ""))
  }
  return output.join("\n")
}

function isPythonLike(filePath: string): boolean {
  return [".py", ".rb"].includes(path.extname(filePath).toLowerCase())
}
