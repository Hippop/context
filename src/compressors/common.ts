const ANSI_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-/.+=]{8,}/i,
  /\bBearer\s+[A-Za-z0-9_\-/.+=]{12,}/i,
  /\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_\-]{12,}/,
]

export function containsLikelySecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "")
}

export function keepFinalProgressFrames(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.includes("\r")) return line
      const frames = line.split("\r").filter(Boolean)
      return frames.at(-1) ?? ""
    })
    .join("\n")
}

export function foldConsecutiveDuplicateLines(text: string, minimumRun = 3): string {
  const lines = text.split("\n")
  const output: string[] = []
  for (let index = 0; index < lines.length; ) {
    let end = index + 1
    while (end < lines.length && lines[end] === lines[index]) end += 1
    const count = end - index
    if (count >= minimumRun && lines[index].trim()) {
      output.push(lines[index], `[previous line repeated ${count - 1} more times]`)
    } else {
      output.push(...lines.slice(index, end))
    }
    index = end
  }
  return output.join("\n")
}

export function collapseBlankLines(text: string): string {
  return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trimEnd()
}

export function foldExternalStackFrames(text: string): string {
  const lines = text.split("\n")
  const output: string[] = []
  let omitted = 0
  const flush = () => {
    if (omitted > 0) output.push(`    ... ${omitted} external stack frame(s) omitted`)
    omitted = 0
  }

  for (const line of lines) {
    const isFrame = /^\s*at\s+/.test(line)
    const external = isFrame && /(?:node_modules|[\\/]effect[\\/]|node:internal|bun:)/.test(line)
    if (external) omitted += 1
    else {
      flush()
      output.push(line)
    }
  }
  flush()
  return output.join("\n")
}

export function foldTimestampedLogs(text: string): string {
  const pattern = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:[.,]\d+)?\s*(?:\[?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\]?\s*)?(.*)$/i
  const lines = text.split("\n")
  const output: string[] = []
  let lastPrefix = ""
  let matched = 0

  for (const line of lines) {
    const match = line.match(pattern)
    if (!match) {
      output.push(line)
      lastPrefix = ""
      continue
    }
    if (/^(?:WARN|WARNING|ERROR|FATAL)$/i.test(match[3] ?? "")) {
      output.push(line)
      lastPrefix = ""
      continue
    }
    matched += 1
    const prefix = `${match[1]} ${match[2]} ${String(match[3] ?? "").toUpperCase()}`.trim()
    if (prefix === lastPrefix) output.push(`  ↳ ${match[4]}`)
    else output.push(`[${prefix}] ${match[4]}`)
    lastPrefix = prefix
  }
  return matched >= 4 ? output.join("\n") : text
}

export function foldLogTemplateRuns(text: string, minimumRun = 3): string {
  const lines = text.split("\n")
  const output: string[] = []
  for (let index = 0; index < lines.length; ) {
    const first = templateForLine(lines[index])
    if (!first || /\b(?:ERROR|FATAL|WARN(?:ING)?)\b/i.test(lines[index])) {
      output.push(lines[index++])
      continue
    }
    let end = index + 1
    const variants: string[][] = [first.variants]
    while (end < lines.length) {
      if (/\b(?:ERROR|FATAL|WARN(?:ING)?)\b/i.test(lines[end])) break
      const candidate = templateForLine(lines[end])
      if (!candidate || candidate.template !== first.template) break
      variants.push(candidate.variants)
      end += 1
    }
    const count = end - index
    const constants = first.template.split(/\s+/).filter((token) => !/^\$\d+$/.test(token)).length
    if (count >= minimumRun && constants >= 2) {
      const rendered = [
        `[log-template ×${count}] ${first.template}`,
        "variants:",
        // Values are original whitespace-delimited tokens, so a single space is
        // sufficient and cheaper than JSON/CSV quoting. Slot order is defined
        // by $1..$N in the template.
        ...variants.map((values) => values.join(" ")),
      ].join("\n")
      const raw = lines.slice(index, end).join("\n")
      if (rendered.length < raw.length) output.push(rendered)
      else output.push(...lines.slice(index, end))
    } else output.push(...lines.slice(index, end))
    index = end
  }
  return output.join("\n")
}

export function foldMatchingLines(
  text: string,
  predicate: (line: string) => boolean,
  label: (count: number) => string,
): string {
  const output: string[] = []
  let folded = 0
  let insertion = -1
  for (const line of text.split("\n")) {
    if (predicate(line)) {
      if (insertion < 0) insertion = output.length
      folded += 1
    } else output.push(line)
  }
  if (folded < 2) return text
  output.splice(insertion, 0, label(folded))
  return output.join("\n")
}

function templateForLine(line: string): { template: string; variants: string[] } | undefined {
  const tokens = line.trim().split(/\s+/)
  if (tokens.length < 3) return undefined
  const variants: string[] = []
  const template = tokens
    .map((token) => {
      if (!isVariableLogToken(token)) return token
      variants.push(token)
      return `$${variants.length}`
    })
    .join(" ")
  return variants.length > 0 ? { template, variants } : undefined
}

function isVariableLogToken(token: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}[T ]?/.test(token) ||
    /^\d{1,2}:\d{2}:\d{2}/.test(token) ||
    /^(?:0x)?[a-f\d]{8,}$/i.test(token) ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(token) ||
    /\d/.test(token)
  )
}
