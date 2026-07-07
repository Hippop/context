# Context 压缩算法与异常处理调研

日期：2026-07-06

补充：更细的“文档类型 × 压缩特征 × 压缩算法”场景清单见 `docs/compression-scenario-matrix.md`。

## 1. 边界：压缩字节不等于压缩 Context

gzip、Brotli、zstd 和 LZ4 适合 raw store 与网络传输；如果在送入模型前解压，token 数不会减少。Context 压缩必须满足以下至少一种：

- 模型直接理解压缩后的文本表示；
- 只选择当前相关的信息；
- 把原文卸载到工具可恢复的外部存储；
- 把事件历史投影成当前状态。

## 2. 算法族

| 算法族 | 代表算法 | 信息损失 | 典型用途 | 主要风险 |
|---|---|---:|---|---|
| Canonicalization | whitespace/ANSI/comment normalization | 无/低 | 所有文本 | 语言相关空白可能有语义 |
| Run/Delta | RLE、prefix/delta、dictionary encoding | 无 | 日志、历史、重复 key | 随机访问差、模板误聚类 |
| Structural | AST/CST skeleton、schema+rows | 可配置 | 代码、JSON、XML | 丢实现细节或字段存在性 |
| Exact dedup | SHA-256/content hash | 无 | 工具输出、文档块 | 相同内容在不同时间可能语义不同 |
| Near dedup | MinHash、SimHash、embedding cosine | 有 | 搜索结果、文档 | 否定和小数值差异被误合并 |
| Retrieval | BM25、embedding、hybrid | 有 | docs、代码、历史 | 查询表达不足导致漏召回 |
| Diversity | MMR | 有 | Top-K chunk | 参数不当导致相关性下降 |
| Graph rank | PageRank/依赖图中心性 | 有 | repo map | 中心文件不一定与当前任务相关 |
| Extractive summary | TextRank、句子选择 | 有 | docs、历史 | 跨句约束丢失 |
| Abstractive summary | LLM hierarchical/query-focused summary | 有 | 已完成任务 | 幻觉、摘要逐代退化 |
| Token pruning | perplexity、token classifier | 有 | 自然语言 | 操作符、否定词、标识符丢失 |
| Lifecycle projection | last-write-wins、event sourcing snapshot | 有 | tool/history | 错误判断“已解决” |
| Reversible offload | hash marker + raw store | 正文有损、整体可恢复 | 大输出、blob | 存储泄露、marker 失效 |

## 3. 静态指令：skills、commands、agents、AGENTS.md

OpenCode 的 Skill 正文已经通过 `skill` 工具按需加载，因此第一优先级不是删 Skill token，而是保持 discovery index 简短、避免模型加载无关 Skill。Commands 只在调用时展开，Agent prompt 只应加载当前 Agent；AGENTS.md 则属于高频系统上下文，最值得治理。[OpenCode Skills](https://opencode.ai/docs/skills/)、[Commands](https://opencode.ai/docs/commands/)、[Agents](https://opencode.ai/docs/agents/)、[Rules](https://opencode.ai/docs/rules/)

### 推荐算法：Instruction IR

把自然语言规则解析成：

```text
Rule(scope, trigger, modality, action, exceptions, priority, source)
```

其中 `modality ∈ {MUST, MUST_NOT, SHOULD, INFO, EXAMPLE}`。压缩顺序：

1. Markdown AST 规范化；
2. 完全重复规则 hash 去重；
3. 用 MinHash/embedding 只生成近似候选；
4. 只有双向蕴含或确定性规则键一致才合并；
5. 冲突规则并列保留并携带 source/priority；
6. EXAMPLE 可按预算缩减，MUST/MUST_NOT 不参与 learned token pruning。

### 异常处理

- `do X` 与 `do not X`：不得因高相似度合并；
- 同一路径不同 scope：保留更具体 scope，同时记录继承关系；
- YAML frontmatter 解析失败：全文透传；
- command 中的 `$ARGUMENTS`、`$1`、`@file`、`!\`shell\``：作为不可分割 token 保护；
- 权限声明与 prompt 冲突：权限是硬边界，prompt 不得覆盖。

## 4. 代码：C、C++、Java、Python

### 4.1 Lexical minification

去 license、注释和空行的成本低，但不能成为主算法：C/C++ 宏空白、Python 缩进/docstring、Java annotation 都可能有语义。

### 4.2 AST/CST skeleton

用 Tree-sitter 提取 imports、类型、函数/方法签名、继承关系和关键全局声明，函数体替换为定位 marker。Repomix 使用 Tree-sitter 提取关键签名；Aider 再将符号引用组成依赖图，在 token budget 内做相关性/中心性排序。[Repomix](https://github.com/yamadashy/repomix)、[Aider Repo Map](https://aider.chat/docs/repomap.html)

语言保护策略：

- C/C++：预处理器、宏、typedef、template、namespace、struct/class layout、extern；
- Java：package/import、annotation、generic bound、extends/implements、字段和方法签名；
- Python：import、decorator、async、type hint、class/def、模块和首级 docstring；
- 所有语言：语法树含 ERROR node 或 parser 超时则回退 lexical 保守模式。

### 4.3 任务相关选择

候选符号分数：

```text
score = 0.45*BM25 + 0.25*embedding + 0.20*dependencyRank + 0.10*recency
```

再用 MMR 降低重复符号。权重是初始假设，必须通过 corpus 调参。

## 5. JSON 与 XML

### JSON

1. parse + minify：无损基线；
2. homogeneous array → `count + schema + rows`；
3. 重复 key、enum 和固定列字典编码；
4. 稀有状态、error 字段、极值和 query anchor 强制保留；
5. 长 Base64/HTML/string → raw marker。

禁止在无 schema 时删除 null、false、0、空数组或默认值，因为“缺失”与“存在但为空”可能语义不同。

### XML

1. namespace URI 建短别名字典；
2. 去注释与标签间非语义空白；
3. 重复同构 sibling 转 schema+rows；
4. 保留 XPath、attribute、order 和 namespace 映射。

出现 `xml:space="preserve"`、DTD/entity、CDATA 或 mixed content 时，禁用 whitespace folding；解析失败原样返回。

## 6. 日志、构建、UT/FT

### Drain 模板挖掘

Drain 使用固定深度解析树和位置相似度在线聚类日志。适合把重复常量前缀只输出一次，并将时间、ID、IP、路径等变量放入 variant table。[Drain](https://doi.org/10.1109/ICWS.2017.13)

保守实现：仅折叠连续 run；模板至少 2 个常量 token；run 至少 3 行；顺序不变；变量表允许重建原行。

### 命令感知状态机

- build：`progress* → warning/error* → final-status`；
- test：`pass* → fail-details* → summary`；
- progress bar：同一 `\r` 行只保留最终帧；
- stack：项目帧全保留，第三方连续帧计数折叠；
- git diff：默认不做实现级有损压缩，只去 ANSI/重复元数据。

### 异常处理

- 退出码非零但无 ERROR：保留末尾窗口和 stderr；
- 测试 runner 格式未知：通用重复折叠，不猜 PASSED/FAILED；
- warning 数超过预算：按 signature 聚合，但每种保留一个完整实例；
- 编译输出交错并发：按原始顺序，不按 module 重排；
- verbose/debug/trace：跳过命令级折叠。

RTK 的核心经验是命令专用 formatter 和“有疑问就保留”；Headroom 进一步组合内容路由、代码/日志/结构化压缩和可恢复存储。[RTK](https://github.com/rtk-ai/rtk)、[Headroom](https://github.com/headroomlabs-ai/headroom)

## 7. 历史与错误

### 策略

1. exact duplicate：hash(tool, args, output)；
2. supersession：同一资源的旧 status/listing 被新结果替代；
3. state delta：只保留改变字段；
4. completed subtask：目标、结论、证据、变更文件、遗留风险；
5. error digest：type、normalized message、count、project frames、attempts、latest status；
6. recent window + pinned facts：防止刚产生的信息被清理。

DCP 的做法包括相同工具与参数去重、错误输入延迟清理、范围/消息摘要、protected tools，并指出任何历史变换都会影响 exact-prefix prompt cache。[OpenCode DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning)

### Prompt cache 异常

每轮重新改写很早的历史会破坏缓存前缀。因此：

- 自动规则输出必须确定；
- 仅在压缩边界批量更新旧历史视图；
- 最近窗口保持字节稳定；
- benchmark 同时记录 token saving 与 cache read/write。

## 8. Learned compression 的位置

LLMLingua 用小语言模型的 token 重要性压缩 prompt；LongLLMLingua增加 query-aware long-context 排序；LLMLingua-2 用蒸馏后的 token classifier 提高通用性和速度。[LLMLingua](https://aclanthology.org/2023.emnlp-main.825/)、[LongLLMLingua](https://aclanthology.org/2024.acl-long.91/)、[LLMLingua-2](https://aclanthology.org/2024.findings-acl.57/)

本插件只把它作为自然语言 docs/history 的最后兜底，不用于代码、JSON/XML exact 模式和强制指令。

## 9. 统一回退矩阵

| 条件 | 处理 |
|---|---|
| secret-like | 原文透传，不落盘 |
| 内容低于阈值 | 原文透传 |
| 加 marker 后收益不足 | 原文透传 |
| parser 错误/超时 | 降级到保守 lexical；仍失败则原文 |
| raw store 写失败 | 默认取消有损压缩 |
| round-trip 不一致 | exact 模式失败，原文透传 |
| 关键字段召回不足 | corpus gate 失败，不发布该 compressor |
| 恢复 ID 跨 session | 拒绝 |
| 压缩器抛异常 | 记录原因，原文透传，Agent 继续 |

## 10. 评测指标

- `token_saving = 1 - compressed_tokens/original_tokens`
- critical fact recall：规则、错误、符号、字段的召回率；
- round-trip equality：JSON/XML/模板日志 exact 模式；
- task success、测试通过率、编辑成功率；
- latency p50/p95/p99；
- first-compaction turn、compaction count；
- prompt cache read/write；
- raw recovery rate：压缩后模型主动找回原文的频率。

不能只按 token saving 排序算法；发布门槛首先是关键事实召回和任务正确性。
