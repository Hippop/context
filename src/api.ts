// Library consumers import pure compressor APIs from this subpath. Keep these
// runtime exports out of the OpenCode plugin entry: the legacy plugin loader
// treats every function exported by the entry module as a plugin factory.
export { compressReadContent, classifyReadMode } from "./compressors/read.js"
export { compressShellOutput } from "./compressors/shell.js"
export {
  canonicalizeJson,
  compressInstructionMarkdown,
  compressJsonContent,
  compressXmlContent,
  requiresXmlWhitespacePreservation,
} from "./compressors/structured.js"
export { compressReadThroughPipeline, compressShellThroughPipeline, runRegisteredCompressor } from "./core/pipeline.js"
export type { LoggerPort, MetricInput, MetricsSink, RawObservationWriter } from "./core/ports.js"
export { createDefaultRegistry, selectCompressor } from "./core/registry.js"
export { estimateTokens } from "./token-estimator.js"
export type { CompressionResult, DensityConfig, DensityOptions, MetricsSnapshot } from "./types.js"
export type {
  CompressionContract,
  CompressionInput,
  Compressor,
  ContentKind,
  ContentProfile,
  ContextSource,
  FidelityLevel,
} from "./core/context-object.js"
