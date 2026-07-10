# OpenCode Context Density Plugin 开发设计方案

日期：2026-07-10  
状态：Living Development Document  
适用范围：OpenCode Context 信息密度提升插件及其后续演进  
关联文档：

- `docs/requirements.md`
- `docs/compression-algorithms.md`
- `docs/compression-scenario-matrix.md`
- `docs/architecture-book.md`
- `docs/adr/`
- `docs/bdd.md`
- `docs/benchmark-results.md`
- `docs/delivery-audit.md`
- `AI原生研发调度系统/`

---

## 1. 文档目标

本文描述本项目从需求澄清、算法探索、领域建模、架构设计、代码开发、自动验证到真实 Agent A/B 评估的完整研发方法。

本文重点回答以下问题：

1. 如何使用 AI 工具参与研发，而不是简单让 AI 一次性生成代码；
2. 如何将需求、设计、代码和验证连接成可追踪的证据链；
3. 如何保证 AI 生成结果符合正确性、性能、安全和容错要求；
4. 如何判断一个压缩算法是否真正有效；
5. 如何避免“Token 降低但任务质量下降”或“局部执行很快但端到端更慢”；
6. 如何让后续新增压缩场景时不破坏现有能力。

本文不是单次实施计划，而是项目持续演进时应遵守的研发约束。

---

# 2. AI 原生研发哲学

## 2.1 AI 是执行者，不是事实裁判

AI 可以参与：

- 需求澄清；
- 仓库探索；
- 算法调研；
- 领域建模；
- 架构方案生成；
- 测试场景设计；
- 代码和测试实现；
- 失败分析；
- 文档整理；
- 代码审查。

但 AI 输出不能直接作为完成依据。

最终事实必须来自：

- 代码；
- 自动化测试；
- 编译结果；
- Benchmark；
- OpenCode 真实加载结果；
- Provider Usage；
- Git Diff；
- 可检查的 Artifact 和 Evidence。

因此本项目采用以下原则：

```text
AI 负责提出候选方案和执行修改
确定性工具负责判断结果是否成立
```

禁止仅凭 AI 声称“已经完成”“性能提升”“不会丢失信息”。

---

## 2.2 从 Prompt 驱动转向 Goal Contract 驱动

直接将宽泛需求交给 Coding Agent，容易出现：

- AI 自行扩大或缩小范围；
- 忽略非功能要求；
- 为通过测试修改测试意图；
- 只实现正常路径；
- 未定义什么情况下算完成；
- 多轮执行后目标发生漂移。

开发前必须先形成 Goal Contract，至少包含：

| 内容 | 说明 |
|---|---|
| Goal | 最终要解决的问题 |
| In Scope | 本轮必须实现的范围 |
| Out of Scope | 明确不做的内容 |
| Acceptance Criteria | 可观察、可验证的验收条件 |
| Invariants | 任何实现都不能突破的约束 |
| Forbidden Actions | 禁止采用的捷径 |
| Definition of Done | 完成条件 |
| Open Questions | 尚未解决的问题 |
| Evidence | 每个结论需要什么证据 |

本项目的重要禁止项包括：

- 不修改 OpenCode 源码；
- 不用压缩后的探索源码直接完成精确编辑；
- 不为了提高压缩率删除错误、路径、行号和约束；
- 不将疑似 Secret 内容写入 Raw Store；
- 不通过削弱测试或验收标准让实现通过；
- 不用估算 Token 冒充真实 Provider Usage。

---

## 2.3 从聊天过程驱动转向产物驱动

AI 的聊天记录不是可靠的长期项目知识。

每个研发阶段必须形成可版本控制的产物：

```text
原始需求
  ↓
Goal Contract
  ↓
Repository Map
  ↓
Domain Model
  ↓
ADR
  ↓
BDD / Test Matrix
  ↓
Implementation Result
  ↓
Verification Evidence
  ↓
Benchmark Report
  ↓
Delivery Audit
```

后一个阶段必须读取前一个阶段的产物，而不是仅依赖聊天记忆。

重要决策必须进入仓库：

- 需求进入 `docs/requirements.md`；
- 算法分析进入 `docs/compression-algorithms.md`；
- 场景策略进入 `docs/compression-scenario-matrix.md`；
- 架构进入 `docs/architecture-book.md`；
- 决策进入 `docs/adr/`；
- 行为进入 `features/` 和 `docs/bdd.md`；
- 评测进入 `benchmark/` 和 Benchmark 报告。

---

## 2.4 从一次性生成转向小步闭环

不采用以下方式：

```text
完整需求
  ↓
AI 一次生成全部代码
  ↓
最后统一测试
```

采用小步垂直切片：

```text
一个可观察行为
  ↓
一个失败测试
  ↓
最小实现
  ↓
测试通过
  ↓
局部 Benchmark
  ↓
提交证据
```

每个切片都必须同时包含：

- 行为规格；
- 正常路径；
- 异常路径；
- 最小代码；
- 自动化测试；
- 性能或压缩收益证据；
- 剩余风险。

---

## 2.5 Context 也是研发资产

AI 开发质量很大程度上取决于提供给 Agent 的 Context。

向 Agent 注入上下文时，应遵循：

1. 只提供当前阶段需要的信息；
2. 优先提供结构化 Artifact；
3. 不重复注入整个仓库文档；
4. 明确哪些内容是事实、约束、候选方案和未决问题；
5. 为代码 Agent 提供需求、ADR、BDD 和目标文件，而不是全部聊天历史；
6. 为修复 Agent 只提供失败命令、错误输出、相关 Diff 和不可破坏的验收约束。

本项目开发的 Context Density Plugin 本身也应应用于项目研发过程，避免 OpenCode 在长任务中被低密度日志和重复信息占满。

---

## 2.6 风险决定自动化程度

不同操作采用不同自主级别。

| 风险等级 | 示例 | AI 权限 |
|---|---|---|
| 低 | 文档整理、Fixture 增加、纯函数重构 | 可自动执行并验证 |
| 中 | 新增 Compressor、修改 Pipeline | 自动执行，必须通过完整测试 |
| 高 | 修改安全策略、Raw Store、历史删除语义 | 必须 ADR 和人工审查 |
| 极高 | 修改持久化 Session、权限模型、Secret 策略 | 默认禁止自动执行 |

AI 可以自动提出高风险方案，但不能自动将高风险架构决策视为已批准。

---

## 2.7 失败是数据，不是继续重试的理由

Agent 失败后应先分类，再决定后续动作。

禁止无条件重复同一个 Prompt。

失败类型建议包括：

| 类型 | 说明 | 处理方式 |
|---|---|---|
| `IMPLEMENTATION_ERROR` | 编译、类型、运行时代码错误 | Code Agent 修复 |
| `TEST_DEFECT` | 实现违反测试描述的行为 | Test/Code Agent 联合分析 |
| `CONTRACT_ERROR` | API、Schema、行为契约不一致 | 回到 ADR 或契约设计 |
| `ENVIRONMENT_ERROR` | 网络、依赖、权限、Provider 故障 | 环境处理或延迟重试 |
| `POLICY_VIOLATION` | 尝试绕过安全或验收约束 | 阻断并人工处理 |
| `HARNESS_DEFECT` | 调度、证据写入或执行器自身错误 | 修复研发 Harness |
| `UNKNOWN` | 暂时无法分类 | Failure Analyzer 分析 |

同一失败签名连续出现时，视为无进展。

达到无进展窗口或重试预算后必须停止，而不是无限调用模型。

---

# 3. AI 工具与研发工具链

## 3.1 `grill-me-doc`

用于需求澄清。

它的目标不是生成长篇需求文档，而是通过追问发现：

- 目标是否明确；
- 使用场景是否完整；
- 是否存在冲突要求；
- 哪些信息必须保留；
- 哪些失败可以接受；
- 如何验证任务是否完成；
- 哪些内容明确不在范围内。

输出为 Goal Contract 和未决问题清单。

---

## 3.2 OpenCode

OpenCode 是本项目主要 Coding Agent 执行引擎。

根据任务类型使用不同 Agent 模式：

| 模式 | 使用阶段 |
|---|---|
| `plan` | 需求、架构、ADR、测试计划 |
| `explore` | 仓库分析、算法研究、故障定位 |
| `build` | 代码实现、测试实现、问题修复 |

推荐命令形式：

```bash
opencode run \
  --dir <repo> \
  --format json \
  --agent <plan|explore|build> \
  --model <provider/model> \
  --auto \
  "<stage prompt>"
```

生产环境默认不应无条件启用 `--auto`。只有在权限范围、目标仓库和验证命令明确时才允许自动批准。

---

## 3.3 AI 原生研发调度系统

使用 `AI原生研发调度系统/` 对研发阶段进行外部编排。

默认工作流：

```text
goal
  → repository
  → domain
  → architecture
  → behavior
  → implementation
  → verification
  → delivery
```

调度系统负责：

- Run 和 Stage 状态；
- Artifact 保存；
- Evidence 保存；
- Agent 调用；
- 验证命令执行；
- 失败分类；
- 修复循环；
- 重试预算；
- 无进展检测；
- 最终报告。

研发 Harness 与被开发项目必须保持分离。

Harness 负责“如何开发和验证”，插件负责“业务能力”。

---

## 3.4 确定性研发工具

核心工具包括：

- TypeScript；
- Vitest；
- TSX；
- Bun；
- Node.js 20+；
- OpenCode CLI；
- Git；
- npm Pack；
- Benchmark Runner；
- Provider Usage 统计。

工具的职责不是辅助展示，而是构成完成证据。

---

## 3.5 第二模型审查

可以使用第二种模型或 Coding Agent 执行只读审查，例如：

- 需求遗漏检查；
- ADR 方案反驳；
- 安全边界检查；
- 测试覆盖检查；
- Benchmark 归因检查；
- Diff Review。

推荐模式：

```text
主 Agent：实现
第二 Agent：只读审查
确定性验证：最终裁决
```

不建议两个 Agent 并发修改同一工作区。

---

# 4. 总体研发流程

```text
阶段 0：建立现状基线
阶段 1：需求澄清与 Goal Contract
阶段 2：算法和相似项目探索
阶段 3：DDD 与语义模型
阶段 4：场景策略矩阵
阶段 5：非功能要求与核心不变量
阶段 6：架构候选与 ADR
阶段 7：BDD 与测试矩阵
阶段 8：TDD 小步实现
阶段 9：确定性验证
阶段 10：真实 OpenCode A/B
阶段 11：交付审计
阶段 12：持续反馈与演进
```

每个阶段都有明确的输入、输出和退出条件。

---

# 5. 阶段 0：建立现状基线

在 AI 修改代码前，必须先记录当前基线。

至少执行：

```bash
npm install
npm run typecheck
npm test
npm run build
npm run benchmark
npm run test:opencode
```

需要保存：

- 当前 Git Commit；
- Node/Bun/OpenCode 版本；
- 测试数量和结果；
- Benchmark 数据；
- OpenCode 插件加载状态；
- 现有已知问题；
- Provider 和模型；
- 当前配置。

基线失败时，不应立即让 AI 开发新功能。

必须先区分：

- 仓库本身已有故障；
- 环境故障；
- 新功能引入的故障。

---

# 6. 阶段 1：前期需求理解

## 6.1 使用 `grill-me-doc` 澄清需求

重点问题包括：

### 目标问题

- 要降低的是单个工具输出 Token，还是整个任务 Token？
- 主要改善成本、上下文容量、质量还是延迟？
- 是只处理 Shell，还是覆盖 Read、History 和 Compaction？
- 压缩是透明执行，还是由 Agent 主动选择？

### 正确性问题

- 哪些信息绝对不能丢失？
- 什么情况下必须原文透传？
- 哪类输出允许有损压缩？
- 有损内容是否必须可恢复？
- 恢复粒度是完整文本还是分页？

### 安全问题

- Secret 如何识别？
- Raw 数据保存在哪里？
- Session 是否允许互相读取？
- 数据保留多长时间？
- 最大容量是多少？

### 评估问题

- 如何证明 Token 下降？
- 如何证明质量没有下降？
- 如何证明不是因为两个 Agent 的工具轨迹不同？
- 如何评估首次 Compaction 和 Compaction 次数？
- 如何评估端到端时间？

---

## 6.2 输出 Goal Contract

需求澄清阶段必须输出：

```text
目标
范围
范围外
用户场景
验收标准
非功能要求
核心不变量
禁止项
风险
未决问题
验证方式
Definition of Done
```

没有验收方式的需求不能直接进入开发。

---

# 7. 阶段 2：压缩算法探索

## 7.1 调研目标

调研不应只回答“有哪些压缩算法”，还需要回答：

- 算法适合哪类 Context Object；
- 是无损还是有损；
- 是否支持恢复；
- 是否确定性；
- 是否需要模型；
- 性能复杂度；
- 错误风险；
- 对 Prompt Cache 的影响；
- 是否适合 OpenCode Plugin Hook；
- 如何验证关键事实未丢失。

---

## 7.2 调研方式

对相关开源项目执行：

1. 搜索项目和论文；
2. 阅读 README 和架构文档；
3. 下载源码；
4. 找到主要入口；
5. 分析数据流；
6. 分析压缩策略；
7. 分析回退路径；
8. 分析测试和 Benchmark；
9. 记录可借鉴部分；
10. 记录不适合本项目的部分。

不能只依据项目宣传数据做技术选择。

---

## 7.3 重点算法类别

### 无损规范化

- 空白规范化；
- ANSI 去除；
- JSON Minify；
- XML 非语义空白清理；
- Markdown 格式精简；
- 精确去重；
- 前缀字典化。

### 规则型语义压缩

- 测试通过项折叠；
- 构建进度折叠；
- 日志模板聚合；
- 第三方栈帧折叠；
- Error Signature；
- Schema + Rows；
- 状态 Delta；
- 历史输出引用化。

### 结构化代码压缩

- Lexical Skeleton；
- AST/CST Skeleton；
- Tree-sitter Symbol Map；
- Call Graph；
- 按符号渐进展开。

### 检索与摘要

- Extractive Selection；
- MMR；
- Graph Ranking；
- Abstractive Summary；
- Learned Token Pruning。

### 可逆卸载

- Raw Store；
- Content Address；
- Recovery Marker；
- 分页恢复；
- TTL 和容量淘汰。

---

## 7.4 调研产物

输出：

- 算法分类；
- 适用场景；
- 优缺点；
- 异常场景；
- 复杂度；
- 保真级别；
- 推荐实现顺序；
- 不采用理由；
- 对应测试方法。

结果维护在：

- `docs/compression-algorithms.md`
- `docs/compression-scenario-matrix.md`
- `docs/adr/`

---

# 8. 阶段 3：DDD 与语义建模

## 8.1 DDD 的目的

本项目使用 DDD 不是为了机械增加实体、仓储和领域服务，而是解决以下问题：

- “压缩”一词含义过于宽泛；
- 不同场景的保真要求不同；
- Read、Shell、History 的生命周期不同；
- 安全、恢复和指标容易散落在各个 Hook；
- 新增算法容易破坏已有逻辑。

DDD 首先用于建立统一语言和边界。

---

## 8.2 统一语言

核心术语：

| 术语 | 含义 |
|---|---|
| Context Object | 可能进入模型上下文的最小治理对象 |
| Content Profile | 对来源、内容类型、风险和命令类型的分类 |
| Compressor | 对特定内容执行变换的组件 |
| Compression Contract | 保真度、最低收益、恢复要求等约束 |
| Protected Fact | 不允许在压缩中丢失的信息 |
| Raw Observation | 压缩前原始内容 |
| Recovery Marker | 恢复原始内容的 Session 隔离标识 |
| Savings Gate | 判断压缩收益是否值得替换 |
| Safety Gate | Secret、格式和风险检查 |
| Fail-open | 失败时返回原文并继续正常流程 |
| Evidence | 支撑研发结论的机器可验证结果 |

---

## 8.3 限界上下文

建议划分：

1. Context Ingestion；
2. Content Intelligence；
3. Compression Engine；
4. Preservation & Recovery；
5. History Lifecycle；
6. Observability & Evaluation；
7. OpenCode Integration。

每个边界只承担单一责任。

---

## 8.4 SMDD：语义模型驱动开发

本项目将 SMDD 定义为内部研发方法：

> 先明确内容对象的语义、生命周期、保护事实和保真契约，再选择压缩算法和代码结构。

流程：

```text
Context Object
  ↓
Content Profile
  ↓
Compression Contract
  ↓
Candidate Algorithms
  ↓
Safety / Fidelity / Savings Gates
  ↓
Compression Result
```

禁止先写通用正则，再反向猜测它适用于哪些内容。

---

# 9. 阶段 4：明确各场景压缩算法

每类场景必须形成策略卡。

策略卡至少包含：

```text
场景名称
输入来源
内容类型
默认保真等级
保护事实
推荐算法
回退条件
是否要求 Raw Store
最低收益率
性能目标
单元测试
异常测试
Benchmark Fixture
```

---

## 9.1 指令文件

包括：

- `SKILL.md`；
- `AGENTS.md`；
- Command；
- Agent Prompt；
- Rules。

保护：

- MUST、NEVER、必须、禁止、不要；
- 条件和例外；
- 权限；
- 文件路径；
- 命令；
- 输出格式；
- 逻辑冲突。

策略：

- 精确规则去重；
- 示例折叠；
- Markdown 视觉噪声清理；
- 渐进加载。

---

## 9.2 代码文件

探索读取与编辑读取必须分离。

探索读取可以：

- 折叠长函数体；
- 保留签名和类型关系；
- 保留关键控制流；
- 构造 Symbol Skeleton；
- 按需展开。

编辑前必须使用原生 `read` 回读准确范围。

Python 必须保护：

- 缩进；
- Docstring 运行时语义；
- Decorator；
- 类型注解；
- Block 层级。

---

## 9.3 JSON 和 XML

JSON Exact：

- 必须 Round-trip；
- 数字精度不变；
- Key 和类型不变。

JSON Exploratory：

- 可输出 Schema；
- 列信息；
- 示例行；
- 总行数；
- Raw ID。

XML 遇到以下场景必须保守回退：

- DTD；
- Mixed Content；
- `xml:space="preserve"`；
- 无法判断的 Namespace；
- 空白具有业务语义。

---

## 9.4 Shell、测试、构建和日志

测试输出：

- 折叠通过项；
- 保留全部失败；
- 保留 Assertion Diff；
- 保留文件和行号；
- 保留退出状态。

构建输出：

- 折叠进度；
- 保留 Warning 和 Error；
- 保留文件、行列号；
- 保留最终状态。

日志：

- 合并重复模板；
- 保持事件顺序；
- 保留变量；
- 保留 WARN、ERROR、FATAL；
- 保留稀有事件。

带以下选项时默认不执行命令级有损压缩：

```text
--verbose
--debug
--trace
-vv
```

---

## 9.5 历史消息

采用：

- 最近窗口保护；
- 精确 Hash 去重；
- 重复工具输出引用化；
- Error Signature 聚合；
- 最新状态保留；
- 项目栈帧保留；
- 仅修改发往模型的 View。

禁止直接修改 OpenCode 持久化历史。

---

# 10. 阶段 5：非功能性要求

## 10.1 Token 收益

不能简单要求“压缩后字符更少”。

只有满足以下条件才替换：

```text
压缩正文 Token
+ Recovery Marker Token
< 原始 Token × (1 - 最低收益率)
```

如果压缩后的 Marker 使收益不足，则返回原文。

---

## 10.2 性能

规则型 Compressor 目标：

```text
100 KiB 输入
p95 < 20 ms
```

同时评估：

- Compressor 时间；
- Hook 总时间；
- Agent 工具往返；
- 模型响应时间；
- 任务墙钟时间。

局部压缩快，不代表端到端任务更快。

---

## 10.3 稳定性

必须满足：

- Compressor 抛错不影响原工具；
- Raw Store 写入失败时取消有损替换；
- Metrics 写入失败不影响工具输出；
- 配置错误恢复到安全默认值；
- 未识别命令只执行保守处理；
- AI 服务不可用时规则型能力继续工作。

---

## 10.4 安全性

必须满足：

- Secret-like 内容不压缩；
- Secret-like 内容不落盘；
- Raw 数据按 Session 隔离；
- 文件权限为 Owner-only；
- 禁止跨 Session 恢复；
- 设置 TTL 和容量限制；
- 路径必须在 Worktree 内；
- 禁止读取设备、虚拟或非普通文件。

---

## 10.5 可观测性

记录单个 Context Object：

- 来源；
- 类型；
- Compressor；
- 原始字符数；
- 压缩字符数；
- 原始 Token；
- 压缩 Token；
- Marker Token；
- 压缩比；
- 时间消耗；
- 是否应用；
- 跳过原因；
- Raw ID；
- 是否恢复。

记录任务级：

- 总输入 Token；
- 总输出 Token；
- 工具调用次数；
- 首次 Compaction；
- Compaction 次数；
- 任务成功率；
- 质量分；
- 墙钟时间；
- Raw 恢复次数。

估算 Token 必须标记为 Estimated。

真实任务结论使用 Provider Usage。

---

## 10.6 确定性

相同输入和配置应产生相同压缩正文。

允许变化的内容仅包括：

- Raw ID；
- 时间戳；
- Session ID；
- 指标记录时间。

---

## 10.7 可扩展性

新增内容类型时：

- 新增 Content Profile；
- 实现 Compressor；
- 注册到 Registry；
- 增加 Fixture；
- 增加测试；
- 增加 Benchmark。

不应修改 OpenCode Hook 主流程。

---

# 11. 阶段 6：架构设计

## 11.1 总体架构

采用：

```text
Thin OpenCode Adapter
  → Core Pipeline
    → Compressor Registry
      → Pure Compressors
```

旁路组件：

```text
Raw Observation Store
Metrics Ledger
Token Estimator
Configuration
Logger
```

---

## 11.2 OpenCode Adapter

负责：

- Tool 和 Hook 接入；
- 输入映射；
- 权限询问；
- Worktree 路径校验；
- 调用 Core Pipeline；
- 将结果写回 OpenCode。

Adapter 不实现压缩算法。

---

## 11.3 Core Pipeline

统一执行：

1. Content Profile；
2. Compression Contract；
3. Secret Gate；
4. Compressor 选择；
5. 压缩执行；
6. Fidelity 校验；
7. Raw Store Gate；
8. Recovery Marker；
9. Savings Gate；
10. Metrics。

所有接入点应尽量复用同一 Pipeline 约束。

---

## 11.4 Compressor Registry

Compressor 通过注册接入：

```ts
interface Compressor {
  id: string
  supports(profile: ContentProfile): boolean
  compress(input: CompressionInput): CompressionResult
}
```

Compressor 尽量为纯函数：

- 不依赖 OpenCode Runtime；
- 不直接写 Raw Store；
- 不直接写 Metrics；
- 不读取全局 Session；
- 输入输出可独立测试。

---

## 11.5 AI 在运行时架构中的位置

第一版不在 Shell 热路径同步调用模型。

运行时优先级：

```text
无损规则
  → 确定性语义规则
    → 保守回退
```

AI 压缩适合后续作为可选能力，用于：

- 长文档摘要；
- 历史状态提取；
- Compaction 摘要；
- 跨文档相关性选择。

AI 输出必须是候选结果，并经过结构、事实和收益验证。

---

## 11.6 ADR 要求

以下变化必须输出或更新 ADR：

- 新增有损压缩；
- 修改原生 `read` 语义；
- 修改 Raw Store 安全边界；
- 引入模型运行时压缩；
- 引入外部压缩框架；
- 修改历史消息生命周期；
- 修改最低收益计算；
- 引入 Tree-sitter；
- 改变 Prompt Cache 边界；
- 修改数据持久化方式。

ADR 必须包含：

- 背景；
- 候选方案；
- 选择；
- 取舍；
- 后果；
- 风险；
- 实现约束；
- 回滚方式；
- 人工审批点。

---

# 12. 阶段 7：BDD 与 TDD 双循环

## 12.1 外循环：BDD

BDD 描述用户和 Agent 可观察到的行为。

每个 Scenario 应包括：

```gherkin
Given 某类输入和配置
When 内容进入指定 OpenCode 注入点
Then 应保留哪些关键事实
And 应压缩哪些低密度内容
And 异常时如何回退
And 是否可以恢复原文
```

BDD 不描述内部函数名和实现细节。

---

## 12.2 内循环：TDD

实现一个 Scenario 时：

```text
BDD Scenario
  ↓
失败单元测试
  ↓
最小实现
  ↓
测试通过
  ↓
重构
  ↓
Benchmark
```

禁止先实现大量逻辑，再补 Snapshot。

---

## 12.3 测试类型

### 纯函数单元测试

测试：

- Read Compressor；
- Shell Compressor；
- Structured Compressor；
- History；
- Token Estimator；
- Config；
- Secret Detection。

### Core 测试

测试：

- Registry 选择；
- Savings Gate；
- Raw Store Gate；
- Fail-open；
- Marker Token；
- Metrics。

### Adapter 测试

测试：

- OpenCode Tool Schema；
- Hook 映射；
- 权限；
- Worktree 路径；
- 输出包装。

### 集成测试

测试：

- 插件能被 OpenCode 加载；
- Tool 能被模型调用；
- Shell Hook 生效；
- History Transform 生效；
- Compaction Hook 生效。

### 属性和不变量测试

测试：

- JSON Round-trip；
- Secret 永不落盘；
- ERROR/FATAL 集合不减少；
- 相同输入正文确定；
- Raw ID Session 隔离；
- Compressor 抛错返回原文。

---

## 12.4 Definition of Done

一个 BDD Scenario 只有满足以下条件才算完成：

1. Gherkin 描述可观察行为；
2. 至少一个自动化测试能够证明行为被破坏；
3. 正常路径和异常路径都有测试；
4. Token 节省同时断言 Protected Fact；
5. 真实 OpenCode 集成路径有证据；
6. 对应文档和测试追踪已经更新。

---

# 13. 阶段 8：Benchmark 评估体系

## 13.1 Benchmark 原则

不能只测试压缩比。

每个 Benchmark 至少同时报告：

- Token 节省；
- 关键事实召回；
- p50；
- p95；
- 内存变化；
- 回退原因；
- 任务质量；
- 端到端时间。

---

## 13.2 文本级确定性 Benchmark

为每类内容建立 Fixture。

Fixture 包含：

```text
输入文件或命令行输出
内容类型
输入大小
期望压缩阶段
必须保留的 Sentinel
禁止丢失的错误签名
最低压缩率
最大执行时间
```

测试长度至少覆盖：

- 小输入；
- 10 KiB；
- 100 KiB；
- 1 MiB；
- 超过限制的输入。

结果放在：

- `benchmark/`
- `benchmark/fixtures/`
- `benchmark/results/`
- `docs/benchmark-results.md`

---

## 13.3 Shell 压缩数据集

Shell Fixture 至少覆盖：

- Maven；
- npm；
- Vitest；
- pytest；
- JUnit；
- Go Test；
- Gradle；
- Docker；
- kubectl；
- 编译器；
- ANSI 动态进度；
- 重复日志；
- 第三方栈帧；
- 多错误输出；
- Secret-like 输出；
- Verbose 输出。

对公开真实输出进行脱敏后加入数据集。

---

## 13.4 集成测试代码库

设计一个独立 Maven 测试项目，包含：

```text
多模块 Java 代码
JSON 配置
XML 配置
Maven POM
单元测试
集成测试
构建日志
运行日志
文档
故意植入的缺陷
```

测试项目应具备：

- 可重复初始化；
- 固定随机种子；
- 固定依赖版本；
- 一键恢复；
- 明确验收脚本；
- Baseline 和 Treatment 独立工作区。

---

## 13.5 七类真实 OpenCode A/B 任务

### 任务一：根据代码生成文档

验证：

- 大量 Read 场景；
- 代码探索压缩；
- 文档事实完整性。

### 任务二：根据需求生成设计文档

验证：

- 代码、配置和现有文档的综合读取；
- Context 长度；
- 架构事实召回。

### 任务三：代码生成

验证：

- 探索读取；
- 编辑前原文回读；
- 编译和单测。

### 任务四：测试生成

验证：

- 现有测试读取；
- 代码理解；
- 新测试有效性；
- 是否只追求覆盖率而缺少断言质量。

### 任务五：测试运行和修复

验证：

- Shell 测试输出压缩；
- 错误、断言和项目栈帧保留；
- 修复成功率。

### 任务六：代码评审

验证：

- Git Diff；
- 修改敏感内容不被有损压缩；
- 缺陷发现率。

### 任务七：编译、运行和故障处理

验证：

- 构建日志；
- 运行日志；
- 环境错误和代码错误分类；
- 端到端成功率。

---

## 13.6 A/B 实验控制

Baseline 和 Treatment 必须保证：

- 相同模型；
- 相同 Provider；
- 相同模型参数；
- 相同需求；
- 相同初始 Commit；
- 独立但同构的 Workspace；
- 相同超时；
- 相同验收命令；
- 相同权限；
- 相同最大重试；
- 执行顺序随机化或轮换。

每类任务至少执行 5 次。

报告：

- 中位数；
- 分位数；
- 失败次数；
- Bootstrap Confidence Interval；
- 工具轨迹差异；
- Token；
- 质量；
- 时间。

当两个变体工具轨迹不同时，必须说明收益来自：

- Compressor；
- 工具选择；
- Prompt 差异；
- 模型随机性；
- Workspace 差异。

不得直接把全部差异归因于插件。

---

# 14. 阶段 9：代码开发方法

## 14.1 实现顺序

推荐顺序：

```text
领域接口
  → 纯 Compressor
  → Core Pipeline
  → Infrastructure
  → OpenCode Adapter
  → Composition Root
  → Smoke / A-B
```

先实现可独立验证的纯函数，再接入 OpenCode。

---

## 14.2 垂直切片示例

以“压缩测试输出”为例：

1. 增加 BDD Scenario；
2. 增加失败 Fixture；
3. 定义必须保留的错误和摘要；
4. 编写失败单测；
5. 实现 Test Output Compressor；
6. 接入 Registry；
7. 接入 Shell Pipeline；
8. 验证 Raw Store；
9. 执行 Benchmark；
10. 执行 OpenCode Smoke；
11. 更新文档和追踪矩阵。

---

## 14.3 AI Agent 输入包

代码 Agent 只接收：

- Goal Contract；
- Repository Map；
- 相关领域模型；
- 已批准 ADR；
- BDD；
- Test Matrix；
- 目标文件；
- 验证命令；
- 禁止项。

避免一次注入所有文档和历史记录。

---

## 14.4 AI 实现要求

要求 Agent：

- 完成最小修改；
- 同时修改测试；
- 不删除已有测试；
- 不弱化断言；
- 不扩大公共 API；
- 不引入无必要依赖；
- 输出修改文件；
- 输出验证命令；
- 输出剩余风险；
- 说明与 ADR 的对应关系。

---

## 14.5 Git 约束

每个提交应满足：

- 单一目标；
- 可独立验证；
- 不混入格式化噪声；
- Commit Message 描述行为变化；
- 重大决策有 ADR；
- Benchmark 结果和代码变更可关联。

建议提交顺序：

```text
docs/requirements
test failing scenario
implementation
refactor
benchmark
delivery docs
```

---

# 15. 阶段 10：验证与修复循环

## 15.1 本地验证顺序

```bash
npm run typecheck
npm test
npm run build
npm run benchmark
npm pack --dry-run
npm run test:opencode
npm run benchmark:ab -- --model <provider/model> --runs 5 --rounds 3
git diff --check
```

快速循环可以只执行相关测试。

进入交付前必须执行完整验证。

---

## 15.2 修复原则

验证失败后，修复 Agent 必须：

1. 读取失败命令；
2. 识别失败类型；
3. 定位最小原因；
4. 不修改验收目标；
5. 不删除失败测试；
6. 不扩大修复范围；
7. 修复后重新执行原失败命令；
8. 再执行相关回归测试。

---

## 15.3 重试预算

默认建议：

```text
最大修复次数：3
无进展窗口：2
```

连续两次出现相同失败签名时停止自动修复。

以下情况立即转人工：

- Policy Violation；
- 架构契约冲突；
- 数据安全风险；
- 需要修改范围或验收标准；
- 两个正确性目标互相冲突；
- 多次修复造成 Diff 持续扩大。

---

# 16. 性能设计

## 16.1 热路径

OpenCode Hook 热路径中：

- 不同步调用大模型；
- 规则扫描尽量单遍完成；
- 避免重复 Token 估算；
- 预编译正则；
- 限制输入大小；
- 大文本使用分块；
- 避免构造大量中间字符串；
- 不在每次 Hook 中扫描整个历史。

---

## 16.2 历史增量处理

历史去重应逐步演进为：

- 增量 Hash；
- Error Signature 缓存；
- 最近窗口索引；
- 状态 Delta；
- 明确压缩边界。

避免每次请求重新处理全部历史。

---

## 16.3 端到端性能

需要区分：

```text
Compressor Latency
Hook Latency
Tool Round-trip
LLM Latency
Task Wall-clock Time
```

`token_save_read` 可能降低输入 Token，但增加一次模型工具决策。

优化方向：

- 小文件直接使用原生 Read；
- 大文件或低密度文件优先推荐 `token_save_read`；
- Shell 优先透明 Hook；
- 对同一文件结果做 Session 缓存；
- 避免 `read → token_save_read` 重复读取；
- 在 Agent 指令中明确工具使用条件。

---

# 17. 容错设计

## 17.1 Fail-open

任一 Compressor、Metrics、Token Estimator 或 Raw Store 出现异常时：

```text
记录错误
返回安全结果
不中断原工具流程
```

对于有损压缩，安全结果通常是原文。

---

## 17.2 Raw Store

有损 Shell 压缩必须：

```text
先保存原文
再替换 Context
```

保存失败时取消有损替换。

Raw Store 初始化失败后，应在当前 Session 降级，避免每次调用重复产生异常。

---

## 17.3 Compressor 熔断

后续建议增加：

```text
同一 Compressor 连续失败达到阈值
  ↓
当前 Session 禁用该 Compressor
  ↓
后续原文透传
```

记录：

- Compressor ID；
- 错误类型；
- 失败次数；
- 首次失败；
- 熔断时间；
- Session。

---

## 17.4 Provider 和 Agent 故障

处理：

- Timeout；
- 502/503；
- Rate Limit；
- 非法 JSON；
- 空输出；
- 权限拒绝；
- 模型无进展。

环境故障不能被错误地分类为代码缺陷。

---

# 18. 安全设计

必须保护：

- API Key；
- Access Token；
- Password；
- Private Key；
- Bearer Token；
- Credential；
- Secret 配置；
- 用户隐私数据。

Secret Gate 位于：

```text
内容进入 Pipeline
  ↓
Secret Detection
  ↓
若命中：不压缩、不落盘、原文透传
```

Raw Store 要求：

- Session 隔离；
- Owner-only；
- TTL；
- 容量淘汰；
- 分页读取；
- 禁止路径穿越；
- 禁止虚拟文件系统；
- 禁止跨 Session 查询。

---

# 19. 可观测性与研发证据

## 19.1 Artifact

Artifact 表达“产出了什么”：

- Goal Contract；
- Repository Map；
- Domain Model；
- ADR；
- BDD；
- Test Matrix；
- Implementation Result；
- Failure Diagnosis；
- Benchmark Report；
- Final Report。

---

## 19.2 Evidence

Evidence 表达“凭什么相信”：

- Agent 调用结果；
- 命令输出；
- Exit Code；
- Duration；
- Test Report；
- Provider Usage；
- OpenCode Smoke；
- Git Diff；
- Benchmark JSON。

Artifact 可以由 AI 生成。

Evidence 必须尽量由确定性工具产生。

---

## 19.3 需求追踪

维护以下映射：

```text
FR/NFR
  → BDD Scenario
    → Test
      → Source Code
        → Benchmark
          → Delivery Evidence
```

没有自动证据的需求不能标记为完成。

---

# 20. 交付物

一次完整迭代至少交付：

## 20.1 需求类

- Goal Contract；
- 需求规格；
- 场景矩阵；
- 非功能要求；
- 核心不变量。

## 20.2 设计类

- Domain Model；
- Architecture Book；
- ADR；
- API 或接口约束；
- 风险分析。

## 20.3 测试类

- BDD；
- Gherkin；
- Test Matrix；
- 单元测试；
- 属性测试；
- Fixture；
- Benchmark；
- A/B 场景。

## 20.4 实现类

- 插件代码；
- 配置示例；
- npm 包；
- 开发安装入口；
- Migration 或兼容说明。

## 20.5 证据类

- Typecheck；
- Test Report；
- Build；
- npm Pack；
- Benchmark；
- OpenCode Smoke；
- Provider A/B；
- Delivery Audit。

---

# 21. 项目级 Definition of Done

本项目一次版本交付只有同时满足以下条件才算完成。

## 21.1 需求

- 范围和范围外明确；
- 验收标准可执行；
- 核心不变量明确；
- 风险和未决问题已记录。

## 21.2 设计

- 架构与代码一致；
- 重大决策有 ADR；
- 新能力没有绕过统一 Pipeline；
- 安全和恢复边界明确。

## 21.3 代码

- Typecheck 通过；
- 单元测试通过；
- Build 通过；
- 不存在不必要依赖；
- Diff 无无关修改；
- 公共 API 变化已记录。

## 21.4 正确性

- Protected Fact 全部保留；
- JSON Exact Round-trip；
- Secret 不落盘；
- ERROR/FATAL 集合不减少；
- Compressor 异常原文透传；
- 有损内容可恢复。

## 21.5 性能

- 规则型 Compressor 满足 p95 目标；
- 压缩后包含 Marker 仍达到最低收益；
- 不造成不可接受的内存增长；
- 真实任务报告端到端时间。

## 21.6 集成

- OpenCode 正常加载；
- Tool 能调用；
- Hook 能执行；
- Plugin Load Error 为零；
- 原生 `read` 行为不受破坏。

## 21.7 评估

- 确定性 Benchmark 完成；
- 真实 A/B 完成；
- 报告 Token、质量和时间；
- 对工具轨迹差异进行解释；
- 没有夸大单次实验结果。

## 21.8 交付

- 文档已更新；
- 需求到证据可追踪；
- 剩余风险明确；
- 回滚方式明确；
- Delivery Audit 完成。

---

# 22. 当前项目实施重点

当前版本已经具备第一版插件、分层架构、BDD、单元测试、确定性 Benchmark 和真实 OpenCode A/B 基础。

下一阶段优先级建议：

1. 扩充多任务、多模型、多轮真实 A/B；
2. 优化 `token_save_read` 引入的工具往返延迟；
3. 引入 Tree-sitter Symbol Skeleton；
4. 增加 Compressor Session 级熔断；
5. 优化历史增量 Hash 和错误签名索引；
6. 增加大输入和内存 Benchmark；
7. 增加 Raw Store 故障注入；
8. 建立标准 Maven A/B 测试仓库；
9. 完善 CI 中的 OpenCode Smoke；
10. 将研发 Harness 用于后续功能迭代。

---

# 23. 最终原则

本项目研发过程中始终遵循：

```text
目标先于 Prompt
产物先于聊天
契约先于实现
测试先于声明
证据先于结论
正确性先于压缩率
端到端效果先于局部指标
安全回退先于激进优化
小步闭环先于一次性生成
```

Context Density Plugin 的目标不是删除最多的文本，而是在有限 Context 中保留更多能够支持正确决策的信息。

AI 原生研发的目标也不是生成最多的代码，而是用可追踪、可验证、可停止的方式，更稳定地交付正确的软件。
