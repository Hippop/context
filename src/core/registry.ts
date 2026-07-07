import { compressReadContent, type ReadMode } from "../compressors/read.js"
import { compressShellOutput } from "../compressors/shell.js"
import type { CompressionInput, Compressor, ContentProfile } from "./context-object.js"

export function createDefaultRegistry(): Compressor[] {
  return [
    {
      id: "read.content-aware",
      supports(profile) {
        return profile.source === "read"
      },
      compress(input) {
        const mode = readModeFromProfile(input.profile)
        return compressReadContent(input.profile.filePath ?? "unknown.txt", input.text, mode, input.contract.minSavingsRatio)
      },
    },
    {
      id: "shell.command-aware",
      supports(profile) {
        return profile.source === "shell"
      },
      compress(input) {
        return compressShellOutput(input.profile.command ?? "", input.text, {
          minChars: 0,
          minSavingsRatio: input.contract.minSavingsRatio,
          preserveVerbose: input.contract.preserveVerbose ?? true,
          skipSecretLikeOutput: input.contract.skipSecretLikeOutput,
        })
      },
    },
  ]
}

export function selectCompressor(registry: Compressor[], profile: ContentProfile): Compressor | undefined {
  return registry.find((compressor) => compressor.supports(profile))
}

export function readModeFromProfile(profile: ContentProfile): ReadMode {
  if (profile.kind === "raw") return "raw"
  if (profile.kind === "shell" || profile.kind === "history") return "raw"
  return profile.kind
}
