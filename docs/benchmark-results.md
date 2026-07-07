# Benchmark 结果

日期：2026-07-07  
OpenCode：1.17.13  
真实 A/B 模型：`opencode/mimo-v2.5-free`

## 1. 确定性 compressor corpus

命令：

```bash
BENCH_ITERATIONS=100 bun benchmark/run.ts
```

Corpus 覆盖 UT、FT、组件构建、日志、Skill、Command、Agent、AGENTS.md、设计文档、C/C++/Java/Python、JSON、XML 和长历史，共 16 类。

结果摘要：

| 类别 | Token 节省 | 关键事实召回 | p95 |
|---|---:|---:|---:|
| UT pytest | 99.4% | 100% | 2.440ms |
| FT | 98.4% | 100% | 0.851ms |
| 组件构建 | 99.4% | 100% | 1.193ms |
| 日志 | 81.1% | 100% | 8.451ms |
| 四类指令对象 | 95.1% | 100% | ≤0.409ms |
| 设计文档 | 78.1% | 100% | 0.087ms |
| C/C++/Java | 31.0–33.0% | 100% | ≤0.063ms |
| Python | 1.3% | 100% | 0.044ms |
| JSON | 67.8% | 100% | 2.445ms |
| XML | 21.4% | 100% | 1.720ms |
| 长历史 | 45.1% | 100% | 1.529ms |

“关键事实召回”是每个 fixture 的 sentinel 集合，并不等价于通用语义正确率。Python 样本收益很低，证明保守策略会拒绝为了数字而删除 docstring 或结构；后续应使用 Tree-sitter skeleton 提升探索模式收益。

## 2. OpenCode 真实模型 A/B

任务：在 1,500 行日志中找出唯一 ERROR，返回 code、file、cause、confidence。两个变体使用相同模型和同构独立 workspace。

命令：

```bash
bun benchmark/opencode-ab.ts \
  --opencode ~/.opencode/bin/opencode \
  --model opencode/mimo-v2.5-free \
  --runs 1 --rounds 1 --timeout 120000
```

| 指标 | Baseline | Treatment | 变化 |
|---|---:|---:|---:|
| 输入 token | 45,807 | 22,499 | -50.9% |
| 输出 token | 165 | 116 | -29.7% |
| 质量分 | 1.0 | 1.0 | 持平 |
| 墙钟时间 | 13.82s | 19.28s | +39.5% |

工具轨迹：

- Baseline：`read → glob`，原始 read 输出 56,141 chars；
- Treatment：`glob → token_save_read`；`token_save_read` 输出 25,158 chars 且 `compressionApplied=true`；
- 两边都正确返回 `E_DENSITY_7319 / src/cache.ts / stale-generation-counter`。

解释：本次真实样本验证了主 Session token 下降与质量守住；treatment 多一次模型工具决策往返，因此延迟仍上升。后续应增加多次重复取中位数，并分别评估“透明 Shell 压缩”和“探索工具”两条路径。

## 3. 测试过程中发现并修复的问题

1. `north-mini-code-free` provider 连续 502；A/B runner 已加入 timeout 与错误分类。
2. OpenCode 对 plugin Zod schema 只校验、不把 `.default()` 的解析结果传给 execute；真实调用曾出现 `mode=undefined`。运行时默认值已显式补齐并增加回归测试。
3. 第一次 treatment 的节省不能归因于 compressor，已废弃；上表是修复后重新执行的结果。
4. OpenCode legacy loader 会执行插件入口的每个函数导出；已将纯 compressor API 移到 `/api` 子路径，使根入口只包含插件函数。

最终干净加载（`plugin_load_error_count=0`）的详细 JSON 位于 `benchmark/results/opencode-ab-2026-07-06T14-03-38-568Z.json`（运行产物默认不纳入 npm 包）。

项目级插件安装还执行了独立 smoke：OpenCode 从 `.opencode/plugins/context-density.ts` 自动发现插件，模型成功调用 `context_report`，工具和最终文本首行均为 `Context Density Report (provider-neutral token estimates)`，且新增日志中 plugin load error 为 0。可用 `npm run test:opencode` 复现。

## 4. 结论边界

一次免费模型 A/B 只能证明插件加载、工具调用、实际 provider usage 统计和该任务质量成立，不能外推所有 Coding Agent 任务。发布前门槛建议为每类任务至少 5 次，比较中位数和 bootstrap confidence interval。
