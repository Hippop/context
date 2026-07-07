import { describe, expect, it } from "vitest"
import {
  canonicalizeJson,
  compressInstructionMarkdown,
  compressJsonContent,
  compressXmlContent,
  requiresXmlWhitespacePreservation,
} from "../src/compressors/structured.js"

describe("structured context compression", () => {
  it("canonicalizes JSON without changing its data model", () => {
    const source = `{
      "enabled": false,
      "threshold": 0,
      "items": [],
      "nullable": null
    }`
    const canonical = canonicalizeJson(source)
    expect(JSON.parse(canonical)).toEqual(JSON.parse(source))
    expect(canonical.length).toBeLessThan(source.length)
  })

  it("renders homogeneous JSON objects as schema plus rows without dropping rare errors", () => {
    const source = JSON.stringify(
      Array.from({ length: 40 }, (_, index) => ({
        id: index,
        name: `worker-${index}`,
        status: index === 37 ? "ERROR" : "ok",
        active: index % 2 === 0,
      })),
      null,
      2,
    )
    const result = compressJsonContent(source, 0, true)
    expect(result.applied).toBe(true)
    expect(result.stages).toContain("json-schema-rows")
    expect(result.text).toContain("[40]{id:number,name:string,status:string,active:boolean}")
    expect(result.text).toContain("ERROR")
    expect(result.text).toContain("worker-39")
  })

  it("fails open on malformed JSON", () => {
    const source = `{ "missing": ] }`
    const result = compressJsonContent(source, 0, true)
    expect(result.applied).toBe(false)
    expect(result.text).toBe(source)
    expect(result.reason).toContain("invalid JSON")
  })

  it("deduplicates exact instruction rules but preserves opposite rules", () => {
    const source = `---
name: reviewer
description: Review code
---

- MUST run tests before completion.
- MUST run tests before completion.
- MUST NOT publish secrets.
- MUST publish release notes.
`
    const result = compressInstructionMarkdown(source, 0)
    expect(result.text.match(/MUST run tests/g)).toHaveLength(1)
    expect(result.text).toContain("MUST NOT publish secrets")
    expect(result.text).toContain("MUST publish release notes")
    expect(result.text).toContain("name: reviewer")
  })

  it("folds safe XML whitespace and comments", () => {
    const source = `<?xml version="1.0"?>
<!-- generated -->
<model>
  <port id="1">
    <rate>1000</rate>
  </port>
</model>`
    const result = compressXmlContent(source, 0)
    expect(result.applied).toBe(true)
    expect(result.text).not.toContain("generated")
    expect(result.text).toContain('<port id="1"><rate>1000</rate></port>')
  })

  it("preserves XML with mixed content or xml:space", () => {
    const mixed = `<p>Hello <b>world</b> !</p>`
    const preserve = `<pre xml:space="preserve">a   b</pre>`
    expect(requiresXmlWhitespacePreservation(mixed)).toBe(true)
    expect(requiresXmlWhitespacePreservation(preserve)).toBe(true)
    expect(compressXmlContent(mixed, 0).text).toBe(mixed)
    expect(compressXmlContent(preserve, 0).text).toBe(preserve)
  })
})
