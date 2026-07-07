import { performance } from "node:perf_hooks"
import type { CompressionResult } from "../types.js"
import { collapseBlankLines } from "./common.js"
import { finishCompression } from "./result.js"

export function compressJsonContent(
  original: string,
  minSavingsRatio: number,
  exploratory = true,
): CompressionResult {
  const startedAt = performance.now()
  try {
    const value: unknown = JSON.parse(original)
    const canonical = JSON.stringify(value)
    const stages = canonical === original ? [] : ["json-canonicalize"]
    let text = canonical
    if (exploratory) {
      const tabular = renderTabularJson(value)
      if (tabular && tabular.length < text.length) {
        text = tabular
        stages.push("json-schema-rows")
      }
    }
    return finishCompression(original, text, stages, startedAt, minSavingsRatio)
  } catch {
    return finishCompression(original, original, [], startedAt, minSavingsRatio, "invalid JSON preserved")
  }
}

export function canonicalizeJson(original: string): string {
  return JSON.stringify(JSON.parse(original))
}

export function compressXmlContent(original: string, minSavingsRatio: number): CompressionResult {
  const startedAt = performance.now()
  if (requiresXmlWhitespacePreservation(original)) {
    return finishCompression(
      original,
      original,
      [],
      startedAt,
      minSavingsRatio,
      "XML whitespace-sensitive construct preserved",
    )
  }
  let text = original
  const stages: string[] = []
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, (comment) =>
    /TODO|FIXME|SECURITY|IMPORTANT/i.test(comment) ? comment : "",
  )
  if (withoutComments !== text) stages.push("xml-comment-omit")
  text = withoutComments
  const folded = text.replace(/>\s+</g, "><").trim()
  if (folded !== text) stages.push("xml-intertag-whitespace")
  text = folded
  return finishCompression(original, text, stages, startedAt, minSavingsRatio)
}

export function compressInstructionMarkdown(original: string, minSavingsRatio: number): CompressionResult {
  const startedAt = performance.now()
  const lines = original.split("\n")
  const output: string[] = []
  const seen = new Set<string>()
  let fenced = false
  let frontmatter = lines[0]?.trim() === "---"
  let inComment = false
  const stages = new Set<string>()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (index > 0 && frontmatter && trimmed === "---") {
      frontmatter = false
      output.push(line)
      continue
    }
    if (frontmatter) {
      output.push(line.replace(/[ \t]+$/g, ""))
      continue
    }
    if (/^\s*```/.test(line)) fenced = !fenced
    if (fenced) {
      output.push(line)
      continue
    }
    if (inComment) {
      stages.add("instruction-comment-omit")
      if (line.includes("-->")) inComment = false
      continue
    }
    if (line.includes("<!--")) {
      stages.add("instruction-comment-omit")
      if (!line.includes("-->")) inComment = true
      continue
    }
    if (/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line)) {
      stages.add("instruction-table-separator")
      continue
    }
    const key = normalizeInstructionLine(trimmed)
    const isRule = /^(?:[-*+]\s+|\d+[.)]\s+)/.test(trimmed) || /\b(?:MUST|NEVER|SHOULD NOT)\b|必须|禁止|不得|不要/.test(trimmed)
    if (isRule && key && seen.has(key)) {
      stages.add("instruction-exact-dedup")
      continue
    }
    if (isRule && key) seen.add(key)
    output.push(line.replace(/[ \t]+$/g, ""))
  }

  const text = collapseBlankLines(output.join("\n"))
  if (text !== output.join("\n")) stages.add("blank-line-collapse")
  return finishCompression(original, text, [...stages], startedAt, minSavingsRatio)
}

export function requiresXmlWhitespacePreservation(xml: string): boolean {
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|xml:space\s*=\s*["']preserve["']/i.test(xml)) return true
  // Mixed content: non-whitespace text immediately surrounds a child element.
  return />[^<\s][^<]*<[^/!?][^>]*>|<\/[^>]+>[^<\s][^<]*</.test(xml)
}

function renderTabularJson(value: unknown): string | undefined {
  if (isHomogeneousScalarObjectArray(value)) return renderRows(value)
  if (!isPlainObject(value)) return undefined
  const entries = Object.entries(value)
  const sections: string[] = []
  let changed = false
  for (const [key, item] of entries) {
    if (isHomogeneousScalarObjectArray(item)) {
      changed = true
      sections.push(`${JSON.stringify(key)}:${renderRows(item)}`)
    } else sections.push(`${JSON.stringify(key)}:${JSON.stringify(item)}`)
  }
  return changed ? `{${sections.join(",\n")}}` : undefined
}

function renderRows(rows: Array<Record<string, Scalar>>): string {
  const keys = Object.keys(rows[0])
  const schema = keys.map((key) => `${escapeField(key)}:${typeOf(rows[0][key])}`).join(",")
  const body = rows.map((row) => keys.map((key) => encodeScalar(row[key])).join("|")).join("\n")
  return `[${rows.length}]{${schema}}\n${body}`
}

type Scalar = string | number | boolean | null

function isHomogeneousScalarObjectArray(value: unknown): value is Array<Record<string, Scalar>> {
  if (!Array.isArray(value) || value.length < 3 || !value.every(isPlainObject)) return false
  const keys = Object.keys(value[0])
  if (keys.length === 0) return false
  return value.every((row) => {
    const rowKeys = Object.keys(row)
    return rowKeys.length === keys.length && keys.every((key, index) => rowKeys[index] === key && isScalar(row[key]))
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isScalar(value: unknown): value is Scalar {
  return value === null || ["string", "number", "boolean"].includes(typeof value)
}

function typeOf(value: Scalar): string {
  return value === null ? "null" : typeof value
}

function encodeScalar(value: Scalar): string {
  if (typeof value === "string") return JSON.stringify(value).replace(/\|/g, "\\u007c")
  return JSON.stringify(value)
}

function escapeField(value: string): string {
  return value.replace(/[{},|:\n]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)
}

function normalizeInstructionLine(line: string): string {
  return line
    .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/\s+/g, " ")
    .trim()
}
