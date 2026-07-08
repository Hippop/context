import { describe, expect, it } from "vitest"
import { compressShellOutput } from "../src/compressors/shell.js"
import { defaultShellFixtureOptions, shellFixtures } from "./fixtures/shell-fixtures.js"

describe("shell compression", () => {
  it.each(shellFixtures)("$name", (fixture) => {
    const result = compressShellOutput(fixture.command, fixture.raw, {
      ...defaultShellFixtureOptions,
      ...fixture.options,
    })

    expect(result.applied).toBe(fixture.shouldApply)
    for (const expected of fixture.expectedStages ?? []) expect(result.stages).toContain(expected)
    for (const value of fixture.mustContain) expect(result.text).toContain(value)
    for (const value of fixture.mustNotContain ?? []) expect(result.text).not.toContain(value)
    if (fixture.shouldApply) {
      expect(result.compressedTokens).toBeLessThan(result.originalTokens)
      const savedPercent = ((result.originalTokens - result.compressedTokens) / result.originalTokens) * 100
      expect(savedPercent).toBeGreaterThanOrEqual(fixture.minSavedPercent ?? 0)
    } else {
      expect(result.text).toBe(fixture.raw)
    }
  })
})
