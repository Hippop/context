import { describe, expect, it } from "vitest"
import { classifyReadMode, compressReadContent } from "../src/compressors/read.js"

describe("exploratory read compression", () => {
  it("classifies common file types", () => {
    expect(classifyReadMode("service.ts", "auto")).toBe("code")
    expect(classifyReadMode("server.log", "auto")).toBe("log")
    expect(classifyReadMode("README.md", "auto")).toBe("markdown")
    expect(classifyReadMode("AGENTS.md", "auto")).toBe("instruction")
    expect(classifyReadMode(".opencode/skills/review/SKILL.md", "auto")).toBe("instruction")
    expect(classifyReadMode("data.json", "auto")).toBe("json")
    expect(classifyReadMode("model.xml", "auto")).toBe("xml")
    expect(classifyReadMode("data.bin", "auto")).toBe("raw")
  })

  it("omits a license and long JSDoc while retaining behavior", () => {
    const raw = `/*\n+ * Copyright 2026 Example\n+ * MIT License\n+ */\n\n/**\n * Adds two values.\n * This explanation is deliberately long.\n * It contains no behavioral constraints.\n * @param a first value\n * @param b second value\n * @returns the sum\n */\nexport function add(a: number, b: number) {\n                return a + b\n}\n`
    const result = compressReadContent("math.ts", raw, "auto", 0)
    expect(result.text).toContain("license header omitted")
    expect(result.text).toContain("documentation omitted")
    expect(result.text).toContain("return a + b")
    expect(result.text).not.toContain("                return")
  })

  it("does not remove Python docstrings", () => {
    const raw = `def important():\n    \"\"\"Runtime-visible documentation.\"\"\"\n    return 1\n`
    const result = compressReadContent("service.py", raw, "auto", 0)
    expect(result.text).toContain("Runtime-visible documentation")
  })

  it("folds long non-Python function bodies while preserving signature and key behavior lines", () => {
    const body = Array.from({ length: 40 }, (_, index) => `  const value${index} = input + ${index}`).join("\n")
    const raw = `export function compute(input: number) {\n${body}\n  if (input < 0) throw new Error("negative")\n  return input * 2\n}\n`
    const result = compressReadContent("service.ts", raw, "auto", 0)
    expect(result.text).toContain("export function compute(input: number)")
    expect(result.text).toContain("body folded")
    expect(result.text).toContain('throw new Error("negative")')
    expect(result.text).toContain("return input * 2")
    expect(result.text).not.toContain("const value39")
  })

  it("removes Markdown table separators but preserves cells and code fences", () => {
    const raw = `# Report\n\n| Name   | Value |\n| :----- | ----: |\n| alpha  | 1     |\n\n\`\`\`ts\nconst x = \"a | b\"\n\`\`\``
    const result = compressReadContent("README.md", raw, "auto", 0)
    expect(result.text).not.toContain(":-----")
    expect(result.text).toContain("|Name|Value|")
    expect(result.text).toContain('const x = "a | b"')
  })

  it("folds repeated timestamp and level prefixes in logs", () => {
    const raw = Array.from(
      { length: 30 },
      (_, index) => `2026-06-02 14:30:45.${String(index).padStart(3, "0")} [INFO] event ${index}`,
    ).join("\n")
    const result = compressReadContent("server.log", raw, "auto", 0)
    expect(result.text).toContain("[log-template ×30]")
    expect(result.text).toContain("[INFO] event")
    expect(result.text).toContain("event $3")
    expect(result.text).toContain("29")
  })
})
