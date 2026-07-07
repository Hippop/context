# BDD 行为规格与测试追踪

Gherkin 文件位于 `features/`。自动化采用 Vitest；OpenCode 真实行为由 CLI smoke/A-B benchmark 验证。

| Feature/Scenario | 需求 | 自动化证据 |
|---|---|---|
| exploratory read before edit | FR-101/102 | `tests/plugin.test.ts` |
| code/instruction compression | FR-103/104/105 | `tests/read.test.ts`, `tests/structured.test.ts` |
| JSON round-trip / tabular | FR-106 | `tests/structured.test.ts` |
| conservative XML | FR-107 | `tests/structured.test.ts` |
| test/build/progress/error retention | FR-201..205 | `tests/shell.test.ts` |
| secret pass-through | FR-004 | `tests/shell.test.ts` |
| duplicate/error history | FR-301..303 | `tests/history.test.ts` |
| reversible/session isolation | FR-304/305 | `tests/raw-store.test.ts`, `tests/plugin.test.ts` |
| metrics/compaction | FR-306/401/402 | `tests/metrics.test.ts`, `tests/plugin.test.ts` |
| deterministic corpus benchmark | FR-403/404 | `benchmark/run.ts` |
| real model quality A/B | FR-403/404 | `benchmark/opencode-ab.ts` result JSON |

## Definition of Done

一个 Scenario 只有在以下条件全部满足时才算 Done：

1. Gherkin 描述了业务可观察行为，而不是实现细节；
2. 至少一个自动化测试失败时能证明该行为被破坏；
3. 异常/回退路径有单独例子；
4. token 节省场景同时断言关键事实保留；
5. 真实 OpenCode hook 的集成路径至少有一次成功加载证据。
