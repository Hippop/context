# Architecture

完整架构书见 [`docs/architecture-book.md`](architecture-book.md)。本文保留为快速概览。

The plugin sits only at public OpenCode extension points and does not patch OpenCode itself.

```text
native bash result ── tool.execute.after ── classifier/pipeline ── safe raw store ── compact result
                                                               └─ metrics ledger

token_save_read ── file type router ── instruction | code | log | Markdown | JSON | XML ── exploratory result

message history ── experimental.chat.messages.transform ── old duplicate/error digest

compaction ── experimental.session.compacting ── preservation rules + density telemetry
```

## Safety invariants

1. Native `read` is never compressed. `token_save_read` is explicitly exploratory and repeatedly tells the model to use native `read` before an edit.
2. Shell compression is fail-open. Small output, low savings, verbose commands, unknown structures, and secret-like output remain unchanged.
3. A shell result is replaced only after the raw result is available. Safe raw results are stored outside the repository with owner-only file permissions and can be paged back with `context_raw`.
4. History pruning only targets exact duplicate outputs from an allowlist and repeated errors with the same normalized signature. The newest tool-output window is protected.
5. Reports say “estimated tokens”; actual token counts vary by provider/model.
6. JSON exact canonicalization must round-trip; XML whitespace-sensitive constructs fail open.

## Extension model

Compressors are pure functions. A new command-aware compressor should:

- identify a stable command/output grammar;
- preserve failures, warnings, summaries, file paths, line numbers, and exit evidence;
- provide a fixture proving semantic retention;
- meet the configured minimum savings ratio;
- fall back to the original text when uncertain.

## Code architecture choice

For long-term readability and extensibility, the selected architecture is documented in
[`docs/adr/0004-code-architecture-for-understandability-and-extensibility.md`](adr/0004-code-architecture-for-understandability-and-extensibility.md):

```text
OpenCode Adapter  →  Core Pipeline  →  Compressor Registry
       │                    │                    │
       │                    │                    ├─ code / instruction / markdown
       │                    │                    ├─ json / xml / log
       │                    │                    └─ shell / history
       │                    │
       │                    ├─ safety gate
       │                    ├─ fidelity contract
       │                    ├─ savings gate
       │                    ├─ raw-store gate
       │                    └─ metrics
       │
       └─ OpenCode tools and hooks only
```

The current implementation follows this shape:

| Architecture role | Current implementation |
|---|---|
| Composition root | `src/index.ts` |
| OpenCode adapter | `src/adapters/opencode/tools.ts`, `src/adapters/opencode/hooks.ts`, `src/adapters/opencode/permissions.ts` |
| Core pipeline | `src/core/pipeline.ts` |
| Compressor registry | `src/core/registry.ts` |
| Context object contracts | `src/core/context-object.ts` |
| Pure compressors | `src/compressors/*.ts`, `src/history.ts` |
| Raw observation store adapter | `src/raw-store.ts` |
| Metrics sink adapter | `src/metrics.ts` |
| Evaluation corpus | `benchmark/run.ts` |

The code deliberately does not import RTK or any external compression framework.
It implements a small set of deterministic, inspectable algorithms directly:

```text
instruction exact-rule dedup
code lexical cleanup + long body folding
markdown visual-format cleanup
json canonicalization + schema/rows rendering
xml conservative inter-tag whitespace folding
shell command-aware test/build/log/progress folding
history duplicate-output and repeated-error digest
```

This keeps the plugin easy to load in OpenCode while giving future algorithms,
such as Tree-sitter skeletons or learned doc/history compression, a stable
extension point. Any external algorithm must be optional and pass through the
same safety, raw-store, savings, and benchmark gates.
