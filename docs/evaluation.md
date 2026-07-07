# Evaluation protocol

The benchmark covers the three requested axes without requiring an LLM call.

```bash
npm run benchmark
```

It reports for each representative input:

- provider-neutral estimated tokens before/after and savings percentage;
- average compressor latency over `BENCH_ITERATIONS` (default 100);
- estimated observations before a 128k context fills, before/after compression;
- the resulting context-persistence multiplier.

Override the assumptions with:

```bash
BENCH_ITERATIONS=1000 CONTEXT_LIMIT=200000 npm run benchmark
```

## End-to-end A/B

For a production evaluation, run the same pinned model, prompt, repository commit, provider settings, and tool permissions twice:

1. Baseline: plugin disabled.
2. Treatment: plugin enabled with default configuration.

Collect OpenCode input/output tokens and `session.compacted` events, then call `context_report` in the treatment. Repeat each task at least five times and compare medians for:

- task success and test pass rate (quality guardrail);
- main-session input tokens;
- time to completion;
- automatic compaction count and turn of first compaction;
- plugin compressor latency;
- sub-agent tokens, reported separately from main-session tokens.

The deterministic benchmark measures compressor mechanics. Only the A/B run can measure model-output quality and real provider tokenization.

## Automated OpenCode A/B

After building, with an authenticated `opencode` CLI available:

```bash
npm run build
npm run benchmark:ab -- --model provider/model --runs 5 --rounds 3
```

每个 OpenCode 子进程默认 120 秒超时，可用 `--timeout 300000` 调整。结果会区分 timeout、provider 502、rate limit 和 authentication，避免把上游故障误判为插件质量问题。

The runner creates identical isolated log-analysis fixtures, runs baseline and treatment sessions through `opencode run --format json`, sums provider-reported step tokens, scores the answer against three hidden fixture facts, measures wall-clock time, and writes detailed JSON under `benchmark/results/`. It exits with a clear `SKIP` when OpenCode is unavailable; it never substitutes synthetic claims for an LLM quality result.
