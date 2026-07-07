import { describe, expect, it } from "vitest"
import * as api from "../src/api.js"
import * as pluginEntry from "../src/index.js"

describe("package entrypoints", () => {
  it("exposes only one unique runtime function from the plugin root", () => {
    const functions = Object.values(pluginEntry).filter((value) => typeof value === "function")
    expect(functions.length).toBeGreaterThanOrEqual(1)
    expect(new Set(functions).size).toBe(1)
    expect(pluginEntry.default).toBe(pluginEntry.ContextDensityPlugin)
  })

  it("keeps pure compressor functions in the api subpath", () => {
    expect(api.compressReadContent).toBeTypeOf("function")
    expect(api.compressShellOutput).toBeTypeOf("function")
    expect(api.compressJsonContent).toBeTypeOf("function")
    expect(api.createDefaultRegistry).toBeTypeOf("function")
    expect(api.compressReadThroughPipeline).toBeTypeOf("function")
  })
})
