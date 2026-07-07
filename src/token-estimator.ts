/**
 * Fast, provider-neutral token estimate. It intentionally labels all values as
 * estimates: actual tokenization depends on the model selected by OpenCode.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let tokens = 0
  const segments = text.match(/[\u3400-\u9fff\uf900-\ufaff]|[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_]/gu) ?? []
  for (const segment of segments) {
    if (/^[\u3400-\u9fff\uf900-\ufaff]$/u.test(segment)) tokens += 1
    else if (/^[A-Za-z0-9_]+$/.test(segment)) tokens += Math.max(1, Math.ceil(segment.length / 4))
    else if (/^\s+$/.test(segment)) {
      const newlines = segment.match(/\n/g)?.length ?? 0
      const horizontal = segment.length - newlines
      tokens += newlines + (horizontal > 1 ? Math.ceil(horizontal / 8) : 0)
    }
    else tokens += 1
  }
  return tokens
}
