# ADR-0004：采用“薄 OpenCode Adapter + Core Pipeline + Compressor Registry”的代码架构

- 状态：Accepted
- 日期：2026-07-07
- 决策者：Context Density Plugin maintainers

## 背景

本插件的长期目标不是只压缩一种输出，而是在 OpenCode 的多个 Context 注入点上持续演进：

- `token_save_read` 面向探索读取，覆盖代码、日志、Markdown、instruction、JSON、XML；
- `tool.execute.after` 面向 Shell 输出，覆盖 test/build/log/progress/stack；
- `experimental.chat.messages.transform` 面向历史消息；
- `experimental.session.compacting` 面向 compaction 前保留规则；
- 后续还可能接入 Tree-sitter、RTK、learned compression、prompt-cache-aware pruning 等能力。

因此代码架构不能只追求“现在能跑”，还必须满足：

1. 新增一个内容类型或命令类型时，不需要理解整个 plugin；
2. OpenCode API 变化时，不影响纯 compressor；
3. 有损压缩、安全、恢复、指标这些横切逻辑不能散落到每个 compressor；
4. 每个 compressor 都能被单独测试、benchmark 和替换；
5. 代码阅读路径要短：入口看编排，领域模块看规则，基础设施模块看副作用。

## 候选架构

### A. 单文件/少文件 Hook 脚本

把所有 OpenCode hooks、工具定义、压缩逻辑、raw store、metrics 都放在 plugin 入口附近。

优点：

- 初始开发最快；
- 调试时文件少；
- 对非常小的插件足够。

缺点：

- `src/index.ts` 会迅速膨胀，OpenCode 适配、业务规则和副作用交织；
- 新增 compressor 容易复制安全 gate、收益 gate、metrics 逻辑；
- 单测只能绕着 hook mock，无法自然做 corpus benchmark；
- 一旦接入 Tree-sitter/RTK/LLM compressor，会变成“万能入口文件”。

结论：适合 spike，不适合长期演进。

### B. 按注入点拆模块

按 OpenCode 注入点划分代码：

```text
read-tool/
shell-hook/
history-transform/
compaction-hook/
raw-tool/
report-tool/
```

优点：

- 与 OpenCode 生命周期一一对应，容易找到 hook；
- 比单文件更清楚；
- 每条 hook 可以独立开关。

缺点：

- 同一种内容策略可能在多个注入点重复，例如日志既可能来自 `token_save_read`，也可能来自 shell；
- safety gate、savings gate、raw store、metrics 容易在不同 hook 中漂移；
- 架构被 OpenCode API 形状主导，而不是被 Context Object 领域模型主导。

结论：比 A 好，但扩展到多内容类型后会出现重复和策略不一致。

### C. 按内容类型拆模块

按 `code/log/instruction/json/xml/shell/history` 划分 compressor，每个 compressor 暴露纯函数，plugin 入口只调用对应模块。

优点：

- 与“不同内容不同压缩策略”的需求高度一致；
- 单元测试和 benchmark 最自然；
- 便于替换某一类算法，例如把代码 lexical compressor 换成 Tree-sitter skeleton。

缺点：

- 如果没有统一 pipeline，横切逻辑仍会散落；
- compressor 如何选择、如何声明保真等级、如何处理 raw store，需要额外约定；
- OpenCode hook 的输入输出包装仍可能堆在入口。

结论：这是当前实现的正确底座，但需要再加一层统一编排。

### D. 纯外部 Proxy / Sidecar

把压缩能力做成外部 CLI 或本地服务，OpenCode plugin 只负责把输入转发过去。

优点：

- 可复用到其他 Agent；
- 重型依赖隔离，例如 Tree-sitter、embedding、LLM compressor；
- 可以独立发布、独立 benchmark。

缺点：

- 部署复杂，插件失去“开箱即用”；
- 权限、sessionID、raw store、安全边界要跨进程传递；
- 延迟和故障面增加；
- 对 OpenCode custom tools/hook 的细节仍需本地 adapter。

结论：适合作为后续可选 accelerator，不适合作为默认架构。

### E. Hexagonal / Ports & Adapters

以领域核心为中心：core 定义 `ContextObject`、`CompressionContract`、`Pipeline`、`Compressor`、`RawObservationStore`、`MetricsSink` 等端口；OpenCode plugin 是 adapter；文件系统、raw store、metrics、RTK/Tree-sitter/LLM 都是可替换 adapter。

优点：

- 领域逻辑和 OpenCode API 解耦；
- 可测试性和可替换性最好；
- 后续支持 CLI benchmark、离线 corpus、其他 Agent runtime 都自然；
- 横切逻辑可以集中在 pipeline：secret gate、fidelity gate、savings gate、raw gate、metrics。

缺点：

- 抽象数量较多；
- 第一版如果过度设计，会让代码比问题本身更难懂；
- TypeScript 小插件中完全 hexagonal 可能显得“企业味过浓”。

结论：方向正确，但需要避免一次性上满所有抽象。

### F. Event-sourced Context Object Pipeline

把所有上下文输入都建模为事件流：

```text
ContextObjectObserved
 → Classified
 → Compressed
 → RawStored
 → MetricRecorded
 → ContextViewEmitted
```

优点：

- 审计、debug、回放、benchmark 极强；
- 很适合研究型系统；
- 可以自然统计“多久触发 compact”“哪些对象被替代”。

缺点：

- 实现复杂度明显高于当前需求；
- 每轮请求引入事件存储会影响 prompt-cache 边界和延迟；
- 对 OpenCode plugin 这种轻量运行环境而言太重。

结论：保留事件命名作为领域语言，不采用完整 event sourcing。

## 决策

选择 C + E 的折中形态：

> **薄 OpenCode Adapter + Core Pipeline + Compressor Registry**

也就是：

1. OpenCode adapter 只做 runtime 边界工作：工具定义、权限确认、hook 输入输出映射、错误日志；
2. Core pipeline 负责统一执行：分类、secret gate、保真契约、compressor 调用、收益 gate、raw store gate、metrics；
3. Compressor registry 按内容类型/命令类型注册 compressor，每个 compressor 是纯函数或近似纯函数；
4. Raw store、metrics、token estimator、可选外部算法通过 ports 注入；
5. benchmark 和单测直接调用 core/compressor，不经过 OpenCode hook。

目标结构：

```text
src/
  index.ts                    # OpenCode plugin adapter：越薄越好
  core/
    context-object.ts          # ContextObject / ContentProfile / CompressionContract
    pipeline.ts                # 统一 safety/savings/raw/metrics 编排
    registry.ts                # compressor 注册与选择
    policies.ts                # fidelity、secret、收益、fallback 策略
  adapters/
    opencode/
      tools.ts                 # token_save_read/context_raw/context_report 定义
      hooks.ts                 # tool.execute.after / messages.transform / compacting
      permissions.ts           # read 权限与 worktree path 校验
    fs-raw-store.ts
    metrics-ledger.ts
  compressors/
    code/
    instruction/
    markdown/
    json/
    xml/
    log/
    shell/
    history/
  evaluation/
    fixtures.ts
    quality-gates.ts
```

当前仓库已经按该架构落地：

| 目标层 | 当前文件 |
|---|---|
| Composition root | `src/index.ts` |
| OpenCode adapter | `src/adapters/opencode/tools.ts`, `src/adapters/opencode/hooks.ts`, `src/adapters/opencode/permissions.ts` |
| Core pipeline | `src/core/pipeline.ts` |
| Compressor registry | `src/core/registry.ts` |
| Context contracts | `src/core/context-object.ts` |
| pure compressors | `src/compressors/*.ts`, `src/history.ts` |
| raw store port/adaptor | `src/raw-store.ts` |
| metrics sink | `src/metrics.ts` |
| token estimator | `src/token-estimator.ts` |
| corpus benchmark | `benchmark/run.ts` |

因此 `src/index.ts` 现在只负责组合 config、ledger、raw store、OpenCode tools/hooks；具体压缩算法由 registry 选择，并由 core pipeline 统一执行安全、收益、raw store 和 metrics gate。

## 关键设计原则

### 1. Plugin 入口只表达 OpenCode 语义

`src/index.ts` 不应知道“如何折叠 pytest”或“JSON schema+rows 怎么做”。它只回答：

- OpenCode 暴露哪些工具；
- 哪些 hook 被注册；
- 如何把 OpenCode 的 input/output 转成 `ContextObject`；
- 如何把 pipeline 结果写回 OpenCode。

### 2. Compressor 只表达内容语义

Compressor 不直接写 raw store，不直接记 metrics，不直接读 OpenCode context。它只返回：

```ts
interface CompressionResult {
  text: string
  applied: boolean
  stages: string[]
  originalChars: number
  compressedChars: number
  originalTokens: number
  compressedTokens: number
  elapsedMs: number
  reason?: string
}
```

如需更强扩展，可演进为：

```ts
interface Compressor {
  id: string
  supports(profile: ContentProfile): boolean
  compress(input: CompressionInput): Promise<CompressionResult>
}
```

### 3. 横切安全逻辑集中在 pipeline

以下逻辑不应散落在各 compressor：

- secret-like 内容不压缩、不落盘；
- 有损压缩必须能恢复；
- marker token 计入最终收益；
- parser/外部工具失败时 fail-open；
- 保真等级决定是否允许有损；
- metrics 记录统一发生。

### 4. Registry 让扩展路径显式

新增一种压缩能力的路径应固定为：

1. 新增 compressor；
2. 注册到 registry；
3. 声明 `ContentProfile`、`CompressionContract`、保护事实；
4. 增加 unit test；
5. 增加 corpus fixture；
6. benchmark 通过后启用默认配置。

### 5. 外部重型能力只能作为可选 adapter

Tree-sitter、RTK、embedding、LLM compressor 都不应成为核心路径的硬依赖。本实现不直接引用 RTK；Shell 压缩只参考“命令感知、保守回退、收益统计”的设计思想，并以自研规则实现。任何外部能力应实现同一 compressor/port 接口，并满足：

- 未安装时自动跳过或 fail-open；
- 超时可配置；
- 输出必须经过相同 safety/savings/critical-fact gate；
- benchmark 单独报告延迟和质量。

## 为什么这个选择最适合本需求

| 评价维度 | 结论 |
|---|---|
| 可理解性 | OpenCode 边界、领域 pipeline、内容 compressor 分层清楚，新人可按“入口 → pipeline → compressor”阅读 |
| 可扩展性 | 新增内容类型只注册 compressor，不改 hook 主流程 |
| 正确性 | safety/raw/收益 gate 集中，减少各模块不一致 |
| 测试性 | compressor 与 pipeline 可独立单测；OpenCode adapter 做少量集成测试 |
| 性能 | 默认纯函数路径无跨进程；重型算法可选接入 |
| 部署 | 保持插件开箱即用，不强制 sidecar |
| 评测 | benchmark 可直接调用 core，真实 A/B 只验证 OpenCode 集成 |

## 后果

正面：

- 代码从“功能能跑”演进为“压缩平台内核”，但不把项目做重；
- 大多数新能力可在 `compressors/` 或可选 adapter 中局部开发；
- OpenCode API 变化时主要影响 adapter；
- 评测和实现使用同一 core，避免 benchmark 与实际插件行为漂移。

负面：

- 相比当前实现会新增 `core/` 和 `adapters/` 目录，文件数量上升；
- 需要维护 registry 和 contract 类型；
- 第一版重构应分阶段做，避免一次性大搬家引入回归。

## 分阶段落地建议

### Phase 1：整理边界，不改变行为（已完成）

- 提取 `src/index.ts` 中的 `token_save_read` 执行逻辑到 `adapters/opencode/tools.ts`；
- 提取 shell hook 编排到 `adapters/opencode/hooks.ts`；
- 保持现有 compressor 函数签名；
- 单测与 benchmark 不改预期。

### Phase 2：引入 Core Pipeline（已完成）

- 新增 `ContextObject`、`CompressionInput`、`CompressionContract`；
- 将 secret gate、raw store gate、marker 计费、metrics 记录迁入 `core/pipeline.ts`；
- `src/index.ts` 只调用 pipeline。

### Phase 3：引入 Registry（已完成）

- 新增 `src/core/registry.ts`，通过 `supports(profile)` 选择 compressor；
- 默认 registry 提供 `read.content-aware` 和 `shell.command-aware` 两个自研 compressor adapter；
- `CompressionContract` 声明 fidelity、收益阈值、raw store 要求、secret/verbose 策略；
- benchmark 按 compressor id 聚合仍是后续评测增强项。

### Phase 4：接入高级算法

- Tree-sitter code skeleton compressor；
- 可选 RTK shell compressor adapter；
- docs/history 的 learned compression 实验 adapter；
- prompt-cache-aware batch pruning 策略。

## 当前不做的事

- 不把插件拆成常驻服务；
- 不把所有历史做 event sourcing；
- 不让 OpenCode adapter 直接依赖重型算法；
- 不为了统一接口牺牲当前纯函数 compressor 的简单性。

## 验收标准

后续代码演进只要满足以下标准，就仍然符合本 ADR：

1. `src/index.ts` 不包含具体压缩算法；
2. compressor 可以不启动 OpenCode 单独测试；
3. 有损压缩统一经过 raw store/savings/secret gate；
4. 新 compressor 至少有 unit test、异常 fixture 和 benchmark case；
5. OpenCode smoke 仍能证明 adapter 正常加载；
6. README/architecture/BDD 能追踪新增能力。
