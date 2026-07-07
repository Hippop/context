# 交付审计与验收证据

日期：2026-07-07

本文按用户目标逐项审计当前仓库状态。结论中的“完成”表示已有可检查的文件、代码或命令证据；“边界”表示已经实现但不应被夸大为更大范围的能力。

## 总体结论

OpenCode Context 信息密度提升插件已经形成一套可运行的第一版交付：

- 不修改 OpenCode 源码，通过项目级 plugin wrapper 加载；
- 提供 `token_save_read`、`context_raw`、`context_report` 三个工具；
- 在 `tool.execute.after`、`experimental.chat.messages.transform`、`experimental.session.compacting` 三类注入点上治理 Shell、历史和 compaction 上下文；
- 覆盖 instruction、代码、日志、Markdown、JSON、XML、Shell、历史消息等对象；
- 具备需求文档、算法调研、架构说明、ADR、BDD、单元测试、确定性 benchmark 和真实 OpenCode A/B smoke/benchmark 证据。

## 目标到证据映射

| 用户目标 | 当前证据 | 验收结论 |
|---|---|---|
| 1. 输出需求文档，采用 DDD/本体论/其他方式均可 | `docs/requirements.md` 使用 DDD + 轻量本体，定义通用语言、限界上下文、聚合、领域事件、FR/NFR、不变量和验收证据 | 完成 |
| 2. 针对不同场景，广泛搜索参考压缩算法，以及异常场景如何处理，输出文档 | `docs/compression-algorithms.md` 覆盖 canonicalization、RLE/delta/dictionary、AST/CST skeleton、exact/near dedup、retrieval/MMR/graph rank、extractive/abstractive summary、token pruning、lifecycle projection、reversible offload；并针对 instruction、代码、JSON/XML、日志/构建/UT/FT、历史/错误列出异常处理 | 完成 |
| 3. 广泛探索实现架构，对比后生成 ADR | `docs/architecture.md` 给出 OpenCode plugin 接入架构；`docs/adr/0001-hybrid-content-aware-pipeline.md`、`0002-fidelity-and-native-read.md`、`0003-reversible-store-and-cache-boundaries.md` 分别记录管线、Read 保真边界和 raw store/cache 边界 | 完成 |
| 4. 输出 BDD 文档，行为驱动测试文档 | `docs/bdd.md` 建立需求到测试追踪；`features/context-density.feature`、`features/content-types.feature`、`features/shell-and-history.feature` 给出 Gherkin 行为规格 | 完成 |
| 5. 输出代码实现和单元测试代码 | `src/` 下实现 plugin、compressors、history、raw-store、metrics；`tests/` 下 8 个测试文件覆盖 plugin、read、shell、structured、history、raw-store、metrics、entrypoint | 完成 |
| 6. 安装 OpenCode，并设计 benchmarks，全流程测试 | OpenCode 1.17.13 已安装并用于 `benchmark/opencode-smoke.ts` 和 `benchmark/opencode-ab.ts`；`benchmark/run.ts` 是确定性 corpus benchmark；`docs/benchmark-results.md` 记录确定性结果和真实 A/B 结果 | 完成 |

## 关键实现证据

### OpenCode plugin 接入

- 项目级开发安装入口：`.opencode/plugins/context-density.ts`
- plugin 根入口：`src/index.ts`
- 纯 API 子路径：`src/api.ts`
- npm 包入口与子路径导出：`package.json`

`src/index.ts` 中的 plugin 返回：

- `tool.token_save_read`：探索读取，显式提示编辑前使用原生 `read`；
- `tool.context_raw`：按 session 恢复被压缩的 Shell 原文；
- `tool.context_report`：输出估算 token 节省、耗时和 compact 次数；
- `tool.execute.after`：透明压缩 Shell 输出；
- `experimental.chat.messages.transform`：压缩消息历史中的重复输出与重复错误；
- `experimental.session.compacting`：给 OpenCode compaction 注入额外保留规则；
- `event`：记录 `session.compacted` 与清理删除 session 的 ledger。

### 压缩能力覆盖

| 场景 | 实现位置 | 主要策略 |
|---|---|---|
| instruction / AGENTS / skill / command / agent | `src/compressors/read.ts`, `src/compressors/structured.ts` | Markdown/instruction 去噪、重复规则折叠、MUST/NEVER 等保护 |
| C/C++/Java/Python 代码探索读取 | `src/compressors/read.ts` | 保守注释/空行/缩进噪声处理，Python 保护运行时 docstring 和块结构 |
| 日志文件 | `src/compressors/common.ts`, `src/compressors/read.ts` | timestamp/level 折叠、连续模板 run 折叠、WARN/ERROR/FATAL 保留 |
| Markdown/docs | `src/compressors/read.ts` | 表格视觉噪声、连续空行、注释等折叠 |
| JSON | `src/compressors/structured.ts` | exact canonicalization、schema+rows、round-trip gate |
| XML | `src/compressors/structured.ts` | 保守空白处理，`xml:space`、DTD、mixed content 等 fail-open |
| Shell build/test/progress/stack | `src/compressors/shell.ts`, `src/compressors/common.ts` | 测试通过项折叠、构建进度折叠、ANSI/进度最终帧、第三方栈帧折叠 |
| 历史消息/重复错误 | `src/history.ts` | exact duplicate output pruning、error digest、recent window 保护 |
| 原文恢复与指标 | `src/raw-store.ts`, `src/metrics.ts` | session 隔离 raw store、分页恢复、估算 token ledger |

## 自动化验证证据

最终验证使用以下命令组合：

```bash
/tmp/context-density-bun/bun-linux-x64/bun node_modules/typescript/bin/tsc --noEmit
/tmp/context-density-bun/bun-linux-x64/bun node_modules/vitest/vitest.mjs run
rm -rf dist && /tmp/context-density-bun/bun-linux-x64/bun node_modules/typescript/bin/tsc -p tsconfig.build.json
BENCH_ITERATIONS=100 /tmp/context-density-bun/bun-linux-x64/bun benchmark/run.ts
/tmp/context-density-bun/bun-linux-x64/bun pm pack --dry-run
OPENCODE_BIN="$HOME/.opencode/bin/opencode" OPENCODE_MODEL=opencode/mimo-v2.5-free /tmp/context-density-bun/bun-linux-x64/bun benchmark/opencode-smoke.ts
/tmp/context-density-bun/bun-linux-x64/bun benchmark/opencode-ab.ts --opencode "$HOME/.opencode/bin/opencode" --model opencode/mimo-v2.5-free --runs 1 --rounds 1 --timeout 120000
git diff --check
```

已观察到的关键结果：

- TypeScript typecheck 通过；
- Vitest：8 个测试文件、27 个测试通过；
- build 生成 `dist/` 成功；
- `bun pm pack --dry-run` 能打出 `opencode-context-density-0.1.0.tgz`；
- OpenCode smoke：项目级 `.opencode/plugins/context-density.ts` 被加载，模型成功调用 `context_report`；
- 确定性 corpus：16 类样本关键事实召回均为 100%，规则型压缩 p95 均低于 20ms；
- 真实 OpenCode A/B：同一日志定位任务中，Treatment 输入 token 从 45,807 降至 22,499，质量分保持 1.0；
- `git diff --check` 无空白错误。

更详细的 benchmark 数值见 `docs/benchmark-results.md`。

## 全流程边界与未扩大声明

这版交付刻意保持保守：

1. 原生 `read` 没有被透明压缩；`token_save_read` 是探索工具，编辑前必须回读原文。这牺牲了一部分自动节省，但避免把有损摘要用于修改。
2. 代码压缩当前是 lexical + 语言保护策略，不宣称已经实现 Tree-sitter AST skeleton。ADR 将 Tree-sitter 作为后续演进方向。
3. Shell 压缩对未知命令、verbose/debug/trace、secret-like 输出、收益不足或 raw store 失败默认 fail-open。
4. token 统计中的 `context_report` 是 provider-neutral 估算；真实 token 结论只来自 OpenCode/provider usage 的 A/B。
5. 一次真实免费模型 A/B 证明插件加载、工具调用、usage 统计和该任务质量成立；发布前仍应按 `docs/benchmark-results.md` 建议扩大到多任务、多次重复和中位数比较。

## 当前验收状态

按用户目标，当前仓库已经满足第一版完整交付要求。剩余工作属于后续增强，而非本轮验收缺口：

- Tree-sitter symbol skeleton；
- 更多真实 coding-task A/B；
- prompt cache read/write 的更细粒度长期评测；
- 可选 RTK 委托集成；
- learned compression 在自然语言 docs/history 上的可配置实验。
