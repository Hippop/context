# Context Density Plugin 需求规格（DDD + 轻量本体）

状态：Draft for implementation  
版本：0.2  
日期：2026-07-06

## 1. 目标与成功定义

在不修改 OpenCode 源码的前提下，通过公开 Plugin hooks 与 custom tools，减少进入主 Session 模型请求的低密度文本，同时保持任务正确性、可恢复性和可观测性。

成功不是“删除最多”，而是同时满足：

1. 相同任务的主 Session 实际输入 token 中位数下降；
2. 任务完成率、测试通过率和关键信息召回率不显著下降；
3. 长任务首次自动 compaction 更晚、自动 compaction 次数更少；
4. 压缩失败时原文透传；有损压缩可以找回原文；
5. 编辑前使用保真源码，而不是探索摘要。

## 2. 通用语言

| 术语 | 定义 |
|---|---|
| Context Object | 可能进入模型上下文的最小可管理对象，如工具输出、规则文件或历史消息 |
| Information Density | 对当前决策有用的信息量与 token 数之比 |
| Compressor | 针对一种内容形态执行确定性或模型辅助变换的领域服务 |
| Compression Contract | 对保真等级、保护字段、恢复方式和回退条件的声明 |
| Fidelity Level | `exact`、`edit-safe`、`exploratory`、`summary` 四级保真等级 |
| Protected Fact | 不允许压缩丢失的信息，如否定规则、错误行号、JSON 精度 |
| Raw Observation | 压缩前的原始工具输出 |
| Recovery Marker | 指向 Raw Observation 的 session 隔离标识 |
| Superseded Output | 已被同一状态对象的更新结果取代的旧输出 |
| Context Budget | 当前模型可用 token 窗口及为某类对象分配的配额 |
| Fail-open | 识别、压缩、计数或存储失败时返回原文，不中断 Agent |

## 3. 限界上下文

### 3.1 Context Ingestion

负责接收 Read、Shell、系统指令、工具 schema、历史消息及 compaction 事件。它只描述来源，不做压缩决策。

### 3.2 Content Intelligence

负责内容分类、命令识别、敏感信息检测、语言识别和风险分级，产出 `ContentProfile`。

### 3.3 Compression Engine

根据 `ContentProfile + CompressionContract + ContextBudget` 选择管线，执行候选压缩并验证收益。

### 3.4 Preservation & Recovery

负责保护事实、原文存储、session 隔离、TTL、容量控制和分页恢复。

### 3.5 History Lifecycle

管理工具输出和错误从 active、resolved、superseded 到 archived 的状态变化，不直接修改持久化 Session 历史，只变换发往模型的视图。

### 3.6 Observability & Evaluation

记录真实/估算 token、压缩率、延迟、回退原因、恢复次数、compaction 次数及质量守护指标。

## 4. 领域模型

```text
Session
 ├─ owns → ContextBudget
 ├─ contains → ContextObject*
 └─ records → CompressionMetric*

ContextObject
 ├─ has → Source(read|shell|instruction|history|schema)
 ├─ classified-as → ContentProfile
 ├─ governed-by → CompressionContract
 ├─ transformed-by → CompressionPipeline
 └─ may-reference → RawObservation

CompressionPipeline
 ├─ consists-of → CompressorStage*
 ├─ produces → CompressionCandidate
 └─ validated-by → SafetyGate + SavingsGate
```

### 聚合与值对象

- `SessionDensity` 聚合：sessionID、metrics、compactionCount、raw observations。
- `CompressionCandidate`：原文/压缩文 token、stage、耗时、保真等级、恢复 ID。
- `ContentProfile`：内容类型、语言、命令类别、敏感性、是否编辑敏感。
- `CompressionContract`：必须保留字段、最小收益率、是否要求可逆、最近窗口。
- `ErrorSignature`：异常类型、规范化消息、项目栈帧、尝试修复、出现次数。

### 领域事件

- `ContextObjectObserved`
- `CompressionApplied`
- `CompressionSkipped`
- `RawObservationStored`
- `RawObservationRecovered`
- `DuplicateOutputSuperseded`
- `RepeatedErrorAggregated`
- `SessionCompacted`

## 5. Context 对象本体与策略

| 对象 | 默认保真 | 注入生命周期 | 首选策略 |
|---|---|---|---|
| SKILL.md | edit-safe | skill 调用时按需加载 | 规则去重、示例折叠、渐进加载 |
| command | edit-safe | 用户调用时注入 | 模板规范化、Shell/File 子结果独立压缩 |
| agent prompt | exact/edit-safe | 当前 agent 激活时 | 只加载当前 agent、权限结构化 |
| AGENTS.md | edit-safe | 每次请求系统指令 | 规则 IR、跨来源去重、冲突保留 |
| docs/Markdown | exploratory | Read/WebFetch | Markdown AST、相关性选择、分层摘要 |
| C/C++/Java/Python | exploratory | 探索 Read | Tree-sitter symbol skeleton；编辑前原生 Read |
| JSON | exact/exploratory | Read/工具输出 | minify、schema+rows、重复 key 字典化 |
| XML | exact/exploratory | Read/工具输出 | 非语义空白清理、namespace/schema 压缩 |
| build/test/log | edit-safe | Shell result | 命令感知解析、Drain 模板、失败优先 |
| history | summary | 每次模型请求 | 精确去重、状态 delta、错误 digest、任务摘要 |
| tool schema | exact | 工具注册/模型请求 | 按需工具集、删除冗余 example/default 描述 |

## 6. 功能需求

### 接入与分类

- **FR-001** 插件必须只使用 OpenCode 公开 API，不修改 OpenCode 源码。
- **FR-002** 必须识别 instruction、code、log、markdown、json、xml、shell 和 history。
- **FR-003** Shell 必须识别 test、build、log 与 unknown；unknown 只能使用保守通用阶段。
- **FR-004** 疑似 secret、私钥、密码、access token 的文本必须原样透传且不得写入 raw store。

### 文件与指令

- **FR-101** 提供探索工具 `token_save_read`；原生 `read` 不得被压缩。
- **FR-102** `token_save_read` 必须声明编辑前使用原生 `read`。
- **FR-103** 代码压缩必须使用语言策略，并保护预处理器、装饰器/注解、签名和类型关系。
- **FR-104** Python 不得因通用缩进算法改变块层级，不得无条件删除运行时 docstring。
- **FR-105** 指令压缩必须保护 MUST/NEVER/必须/禁止/不要、条件、例外、权限、路径、命令和输出格式。
- **FR-106** JSON exact 模式必须可以 round-trip；exploratory 模式可以转换为 schema+rows。
- **FR-107** XML 遇到 DTD、`xml:space="preserve"` 或 mixed content 时必须降级到保守模式。

### Shell 与日志

- **FR-201** 测试输出必须折叠通过项，完整保留失败、断言差异、摘要与退出证据。
- **FR-202** 构建输出必须折叠进度，保留 warning/error、文件、行列号与最终状态。
- **FR-203** ANSI 动态进度只保留最终帧。
- **FR-204** 日志模板压缩必须保持事件顺序，保留变量表、WARN/ERROR/FATAL 和稀有事件。
- **FR-205** `--verbose/--debug/--trace/-vv` 默认不执行命令级有损折叠。

### 历史与恢复

- **FR-301** 只在发往模型前变换历史，不修改 OpenCode 持久化历史。
- **FR-302** 精确重复的旧工具输出可替换为引用，最近 N 个工具结果受保护。
- **FR-303** 重复错误必须聚合为签名、次数、项目栈帧、尝试修复和最新状态。
- **FR-304** 默认启用 raw store 时，原文写入失败必须取消有损替换。
- **FR-305** raw observation 必须按 session 隔离，支持 TTL、容量淘汰和分页恢复。
- **FR-306** compaction 前注入已完成任务、错误与恢复标识的保留规则。

### 可观测与评测

- **FR-401** `context_report` 必须报告 token 前后值、节省率、压缩耗时、类别和 compaction 次数。
- **FR-402** 估算 token 必须明确标记 estimated；真实 A/B 使用 provider usage。
- **FR-403** benchmark 必须覆盖图片中的 instruction、docs、四类代码、JSON、XML、组件构建、UT/FT 和长历史。
- **FR-404** benchmark 必须同时报告质量、token、p50/p95 延迟和首次 compaction。

## 7. 非功能需求

- **NFR-001 性能**：规则型单次压缩 p95 < 20 ms（100 KiB 输入，基准机口径另记）。
- **NFR-002 稳定性**：任何 compressor 抛错均不阻断原工具调用。
- **NFR-003 安全**：缓存文件权限为 owner-only；session 间不可读取。
- **NFR-004 确定性**：相同配置和输入产生相同压缩正文；恢复 ID 除外。
- **NFR-005 缓存友好**：历史清理优先在明确的压缩边界批量执行，避免每轮改变 prompt prefix。
- **NFR-006 可扩展**：新增内容类型不修改已有 compressor，只注册 classifier/stage。
- **NFR-007 可移植**：支持 OpenCode 使用的 Bun，并保持 Node 20+ 开发测试兼容。

## 8. 核心不变量

1. `compressedTokens + recoveryMarkerTokens < originalTokens × (1-minSavingsRatio)` 才替换。
2. 编辑敏感源码不能只依赖 exploratory 输出完成修改。
3. secret-like 内容既不压缩也不持久化。
4. 有损 Shell 压缩在默认配置下必须先成功保存原文。
5. 结构数据 exact 模式必须通过 round-trip equality。
6. 压缩后的错误集合必须包含原集合中的全部 ERROR/FATAL 签名。
7. 指令压缩不得合并逻辑上矛盾或仅否定词不同的规则。

## 9. 范围外

- 修改模型 KV cache 或 provider 服务端 tokenizer；
- 用压缩替代权限、安全审计或 secret scanner；
- 直接覆盖原生 `read` 的编辑语义；
- 保证跨所有模型固定压缩率。

## 10. 验收证据

需求通过 `docs/bdd.md` 映射到 Gherkin、Vitest、OpenCode 加载测试和 A/B benchmark。没有对应自动化证据的需求不得声称完成。
