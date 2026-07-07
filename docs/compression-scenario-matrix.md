# Context 压缩场景矩阵：文档类型、压缩特征与算法

日期：2026-07-07

本文目标是尽可能铺开 Agent Context 中可治理的“文档/对象类型”，把每类对象的低密度特征、可用压缩算法、保护规则和参考工具列成矩阵。它不是要求一次性全实现，而是为后续 compressor registry 提供场景 backlog。

## 参考来源与可借鉴点

| 来源 | 可借鉴点 | 适用边界 |
|---|---|---|
| OpenCode Plugins / Custom Tools / Skills / Agents 文档 | 公开 hook、自定义 tool、skill 按需加载、agent 权限与提示结构 | 插件只能在公开注入点上改写 Context，不改 OpenCode 内核 |
| Repomix | Tree-sitter code compression，保留 imports/exports/classes/functions/interfaces 等结构 | 适合代码架构理解，不适合直接编辑前的精确源码 |
| Aider repo map | Tree-sitter 提取符号定义/引用，再用 repo map 给模型代码导航视图 | 适合仓库级探索，仍需原文回读后编辑 |
| Drain / Drain3 | 固定深度 parse tree 做在线日志模板挖掘，把变量提到 variant table | 适合重复日志、构建输出、服务日志，不适合无规律自然语言 |
| Mozilla Readability / Trafilatura | 网页正文抽取、导航/广告/样板移除、文本密度/链接密度启发式 | 适合 WebFetch/HTML，不适合交互式网页状态还原 |
| OpenCode DCP | 历史工具输出去重、错误摘要、压缩边界、cache tradeoff | 需要避免 pruning 循环、摘要膨胀、prompt cache 破坏 |
| LLMLingua / LongLLMLingua / LLMLingua-2 | 自然语言 prompt token pruning、query-aware compression、token classification | 不应用于代码、强约束指令、JSON/XML exact 模式的关键 token |
| MCP tools spec 与 schema token 讨论 | 工具 schema/description 是高频固定 token 成本，可做按需工具暴露和 schema 压缩 | 不能删除模型调用工具所需的参数、约束和权限语义 |

参考链接：

- OpenCode Plugins: https://opencode.ai/docs/plugins/
- OpenCode Skills: https://opencode.ai/docs/skills/
- OpenCode Custom Tools: https://opencode.ai/docs/custom-tools/
- Repomix code compression: https://repomix.com/guide/code-compress
- Aider repo map: https://aider.chat/docs/repomap.html
- Drain paper: https://jiemingzhu.github.io/pub/pjhe_icws2017.pdf
- Drain3: https://github.com/logpai/Drain3
- Mozilla Readability: https://github.com/mozilla/readability
- Trafilatura: https://trafilatura.readthedocs.io/
- OpenCode DCP: https://github.com/Opencode-DCP/opencode-dynamic-context-pruning
- LLMLingua: https://github.com/microsoft/LLMLingua
- LLMLingua-2 paper: https://aclanthology.org/2024.findings-acl.57/
- MCP tools spec: https://modelcontextprotocol.io/specification/draft/server/tools

## 算法速查表

| 算法族 | 典型算法 | 最适合对象 | 风险 |
|---|---|---|---|
| Canonicalization | trim、换行统一、ANSI 去除、JSON minify、XML inter-tag whitespace | 所有文本、结构化数据、Shell 输出 | 空白/换行在 Python、YAML、Markdown code fence、XML mixed content 中可能有语义 |
| Visual-format stripping | Markdown 表格分隔行、对齐空格、HTML wrapper、ANSI progress frame | Markdown、HTML、终端输出 | 删除代码块、表格语义、颜色标记中的 error 信息 |
| Exact dedup | hash、normalized hash、content-addressed marker | 历史输出、重复规则、重复工具结果、重复网页块 | 同内容在不同时间/路径可能语义不同 |
| Run-length / prefix folding | RLE、timestamp prefix folding、重复行折叠 | 日志、测试 passed、构建 progress、trace | 变量值可能包含唯一错误线索 |
| Template mining | Drain、Drain3、JaccardDrain、regex masks + variant table | 服务日志、构建日志、审计日志 | 模板误聚类会合并不同事件 |
| Structural skeleton | AST/CST/Tree-sitter、ctags、LSP symbol、imports+signatures | 代码、SQL、GraphQL、OpenAPI、protobuf | parser error、宏/装饰器/注解语义丢失 |
| Schema + rows | JSON/CSV/XML homogeneous array → schema + row table | API 响应、配置表、监控指标、测试报告 | null/false/0/空集合不能当默认值删除 |
| Dictionary encoding | key dictionary、enum dictionary、namespace alias、path prefix alias | JSON/XML/YAML、OpenAPI、logs、file lists | 可读性下降，marker 成本超过收益 |
| Retrieval selection | BM25、embedding、hybrid search、query-focused top-k | 文档站、README、历史、代码片段 | query 表达不足会漏召回 |
| Diversity selection | MMR、cluster representative、near-dedup | 搜索结果、网页、issue 列表、日志样本 | 过度去重会丢罕见 edge case |
| Graph ranking | PageRank、dependency graph、call graph、import graph | repo map、模块架构、API 影响分析 | 中心文件未必与当前任务相关 |
| Extractive summary | TextRank、句子选择、heading tree pruning | ADR、设计文档、长 issue、会议纪要 | 跨段约束和否定词丢失 |
| Abstractive summary | LLM query-focused summary、hierarchical summary | 已完成子任务、长历史、自然语言文档 | 幻觉、摘要漂移、逐代退化 |
| Learned token pruning | LLMLingua、LongLLMLingua、LLMLingua-2 | 自然语言说明、RAG 文档、聊天历史 | 不适合强约束指令/代码/结构化 exact 数据 |
| Lifecycle projection | event sourcing snapshot、last-write-wins、state delta | git status、任务状态、错误重试、计划/todo | 判断 resolved/obsolete 错误会删掉未解决事实 |
| Reversible offload | raw store + hash marker + paginated restore | 大 shell 输出、网页原文、长 JSON、附件 OCR | raw store 泄露、跨 session 读取、marker 失效 |

## 场景矩阵

### 1. Agent 静态指令与工具定义

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| `AGENTS.md` / repo rules | 重复规则、长示例、历史背景、导航目录 | Instruction IR、exact rule dedup、heading tree pruning、scope inheritance | MUST/NEVER/禁止/不要、路径、权限、命令、输出格式、例外条件 | OpenCode rules/skills、Claude post-compaction hooks |
| `SKILL.md` | frontmatter + 长 SOP + 多示例 + 安装说明 | discovery index 保持短；正文按需加载；规则去重；示例折叠 | skill 触发条件、参数、禁止事项、引用资源 | OpenCode Skills |
| Slash command 文档 | 参数占位、shell/file 引用、示例输出 | 命令模板 IR；`$ARGUMENTS`/`$1`/`@file` 保护；示例预算化 | 参数占位、权限边界、执行顺序 | OpenCode commands 类文档 |
| Agent prompt | 角色描述重复、工具清单冗余、长行为规范 | agent capability table、权限结构化、只加载当前 agent、重复规则跨 agent 去重 | agent 权限、handoff 条件、模型/工具限制 | OpenCode Agents |
| MCP tool schema | description 过长、examples/default 重复、全量工具注入 | tool shortlist、schema distillation、参数名/类型/required 保留、按需 tool paging | required、enum、format、权限、危险操作说明 | MCP tools spec |
| OpenAPI/SDK tool descriptions | endpoint 描述重复、相同 auth/header、长 example | path prefix dictionary、shared parameter hoist、operation summary table | method/path/status、required params、auth、rate limit | OpenAPI/Swagger |
| Tool execution policy | 同类工具权限重复、禁止规则散落 | policy table canonicalization、scope-specific override | deny/allow、路径 glob、外部网络/写操作限制 | OpenCode plugin permissions |
| System prompt fragments | 多插件重复身份/安全段落 | source-aware exact dedup、conflict-preserving merge | 上下文层级、冲突规则、最新用户要求 | Agent runtime prompt |

### 2. 代码与仓库结构

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| TypeScript/JavaScript | license、JSDoc、长函数体、重复 imports、generated code | Tree-sitter/LSP symbol skeleton、imports+exports+signatures、long body fold、docblock budget | decorators、exports、types、throws/return、side effects | Repomix、Aider repo map |
| Python | 注释、长 docstring、重复 imports、notebook 导出噪声 | AST skeleton、import/class/def/decorator/type hint 保留；docstring 分级；不要通用缩进压缩 | 缩进层级、decorator、runtime docstring、typing overload | Tree-sitter/LSP |
| C/C++ | license、宏展开噪声、模板实现、include guard | preprocessor-aware skeleton、macro table、struct/class layout、function signature/body fold | `#define/#ifdef`、ABI layout、template、extern | Tree-sitter/ctags |
| Java/Kotlin/C# | 生成注释、annotation、getter/setter boilerplate | package/import/class/method skeleton、annotation 保留、bean method folding | annotation、generic bound、extends/implements、visibility | Tree-sitter/LSP |
| Go/Rust | license、长 impl、derive/attribute、test helpers | package/use/struct/trait/interface/function skeleton、impl body fold | attributes/derive、trait impl、error handling、unsafe | Tree-sitter |
| SQL migration | generated header、重复 DDL、index boilerplate | DDL AST summary、table/column/index/change-set table、transaction boundary | order、up/down、constraint、data migration DML | SQL parser |
| GraphQL schema | descriptions、重复 field docs、generated comments | type/query/mutation skeleton、directive preservation、description budget | directive、nullability、deprecated、resolver assumptions | GraphQL parser |
| Protobuf/Thrift/Avro | comments、重复 options、field docs | message/service/field schema table、option hoist | field number、required/optional、oneof、compatibility | schema parser |
| OpenAPI spec | long descriptions、examples、shared schemas repeated | path-method table、component dictionary、example offload | path/method/status/schema/auth|required | OpenAPI tooling |
| Terraform/HCL | provider boilerplate、tags 重复、generated plan | resource/data/module skeleton、attribute diff focus、tag dictionary | resource address、lifecycle、count/for_each、destroy actions | HCL parser |
| Kubernetes YAML/Helm | labels/annotations 重复、managedFields、status | remove managedFields/status、metadata dictionary、kind/name/spec summary | namespace/name/kind、selectors、env/secrets refs | kubectl output patterns |
| CSS/SCSS | reset/minified CSS、vendor prefixes、repeated selectors | selector/property skeleton、media query grouping、dedup identical blocks | cascade order、specificity、variables, important | CSS parser |
| HTML templates | whitespace、boilerplate wrappers、repeated classes | DOM pruning、semantic block skeleton、attribute budget | form inputs, ARIA, script data, template expressions | Readability-like DOM pruning |
| Generated code | huge deterministic files、protobuf client、ORM output | generated-file marker + source schema reference + checksum | generated source/version/checksum、manual patches | `.gitattributes`, codegen headers |
| Minified bundle | one-line huge output、source map noise | do not inject; replace with metadata + sourcemap lookup tool | bundle hash, entrypoints, error line mapping | bundler metadata |
| Repo tree listing | deep `node_modules`/dist/build dirs、long paths | .gitignore-aware tree, depth budget, path prefix dictionary, file-count summary | relevant config/source paths, hidden rules files | Repomix packing |
| `git diff` | context lines, repeated file headers, generated diff | semantic diff summary + exact hunk IDs; no lossy edit path by default | changed lines, file paths, line numbers, deletions | git diff parsers |
| `git blame` | repeated commit metadata、author dates | group by commit, line-range summary, author dictionary | line numbers, commit SHA, changed line | git tooling |

### 3. 文档、网页与知识库

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| Markdown README | badges、TOC、tables visual padding、重复 install examples | Markdown AST pruning、badge/TOC omit、table compact、heading relevance selection | commands、warnings、version constraints | Markdown parser |
| ADR / design doc | 背景冗长、候选方案重复、模板段落 | decision-focused extraction：Context/Decision/Consequences/Risks；heading tree summary | final decision、constraints、status、date | ADR templates |
| API docs | repeated nav/sidebar、method examples、param tables | endpoint table、param schema compression、example budget | required params、status codes、auth, error semantics | docs site extraction |
| Tutorial / how-to | step screenshots、long prose、重复解释 | procedure IR：precondition/steps/expected output/troubleshooting | command order、danger notes、platform-specific branches | runbook compression |
| Changelog / release notes | many versions irrelevant、PR links | version window selection、breaking/security/deprecation extraction | target version, breaking changes, migrations | semver changelog |
| FAQ | repeated Q/A style, nav text | query-focused retrieval + exact Q/A block dedup | answer caveats, version applicability | docs search |
| HTML article/blog | nav、ads、cookie banners、related links、script/style | Readability/Trafilatura-like main content extraction、link density filter、metadata retention | title/date/author、code blocks、tables | Mozilla Readability, Trafilatura |
| Docs site pages | header/footer/sidebar repeated across pages | site chrome fingerprint dedup、main landmark extraction、breadcrumb retention | page title, version switcher, admonitions | Readability + DOM heuristics |
| Search results page | snippets重复、tracking params、same domain repeats | SERP result table、URL canonicalization、domain clustering、MMR | URL, title, date, snippet with query terms | search/rag systems |
| PDF text extraction | headers/footers/page numbers/hyphenation/OCR noise | page header/footer detection、hyphen join、layout block clustering | figures/tables captions、equations、page refs | PDF extraction pipelines |
| Slide deck | speaker notes、template footer、theme XML | title/bullets/table extraction、repeated master removal、image alt summary | slide order, diagrams, warnings | PPTX parsers |
| Word/Docx | styles XML、comments, tracked changes | visible text extraction、comments/change summary、style dictionary | tracked deletions if review task, headings | DOCX parsers |
| Notebook `.ipynb` | execution counts、outputs、base64 images、metadata | markdown+code cell skeleton、output budget、image OCR/alt marker | cell order, errors, final results | Jupyter |
| Wiki export | repeated templates/categories/navboxes | template dedup、section relevance、infobox table compression | citations, dates, definitions | MediaWiki parsers |
| Legal/policy docs | boilerplate clauses、definitions repeated | clause numbering IR、definition table、cross-reference graph | negation, obligations, exceptions, jurisdiction | legal NLP |
| Meeting transcript | filler words、speaker repetition、timestamps | diarized summary、action item extraction、decision log、topic segmentation | decisions, owners, deadlines, dissent | LLMLingua/meeting summarization |
| Email thread | quoted history、signature/footer、reply headers | quote collapse、thread delta、participant/action table | latest request, attachments, dates | email thread parsers |

### 4. 结构化数据与配置

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| JSON object | pretty whitespace、repeated keys、long arrays | canonical minify、schema+rows、key dictionary、long string offload | null/false/0/empty array, numeric precision | JSON parser |
| JSON Lines / NDJSON | repeated event schema、timestamp prefixes | schema+rows per event type、template mining、windowed sample + rare events | ERROR/FATAL, unique IDs, ordering | logs/analytics |
| YAML config | comments、anchors、repeated env blocks | YAML AST canonicalization、anchor-aware dedup、path-value table | indentation, anchors, merge keys, secrets | YAML parser |
| XML | namespaces、pretty whitespace、repeated siblings | namespace alias dictionary、inter-tag whitespace fold、sibling schema+rows | DTD/entity, CDATA, `xml:space`, mixed content | XML parser |
| CSV/TSV | repeated long values、wide columns、many normal rows | schema + sample + outlier rows、column dictionary、run-length by sorted key | header, delimiter, quoting, rare rows | dataframe profiling |
| Parquet/Arrow metadata | schema verbose、row group stats | schema summary + min/max/null count stats | types, logical types, partition keys | columnar metadata |
| `.env` | comments、duplicate vars、secrets | do not compress content if secret-like; only key names + redacted status | values, quoting, export syntax | secret scanners |
| Lockfiles | huge dependency graph、integrity hashes | package/version/license delta summary、top changed deps、hash offload | exact lockfile for install, integrity, transitive vuln path | package managers |
| `package.json` / manifest | scripts, deps, metadata | sorted deps summary, script table, engines/exports focus | scripts, package manager, engines, exports | manifest parser |
| `tsconfig`/compiler config | inherited defaults、comments | effective config diff, path aliases table | extends chain, strict flags, includes/excludes | compiler API |
| ESLint/Prettier config | repeated rule defaults | non-default rule table, extends/plugins list | overrides by glob, disabled rules | config parser |
| Dockerfile | comments, repeated RUN apt lines | stage table, command folding, package list dictionary | base image, env, copy paths, user, ports | Docker parser |
| docker-compose | service boilerplate, env repeats | service table, network/volume dictionary | ports, volumes, secrets, dependencies | YAML parser |
| CI config | matrix expansion noise, repeated steps | job/stage graph, matrix summary, failure-focused step list | permissions, secrets, triggers, cache keys | GitHub Actions |
| Makefile | comments, repeated recipes | target/dependency table, recipe budget | phony, env vars, command order | Make parser |

### 5. Shell、日志、测试与运行时输出

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| Build output | `Compiling xxx`、download progress、warnings repeated | command-aware state machine、progress fold、warning signature grouping | errors, warnings, file:line, final exit status | RTK-like design, self-implemented |
| Unit test output | hundreds of PASSED、snapshot body huge | pass fold、failure detail retain、summary retain、snapshot diff budget | failed test name, assertion diff, stack, counts | test runner parser |
| E2E/browser test | screenshot/video paths、retry logs、passed steps | failed scenario extraction、trace artifact marker, step grouping | failing step, URL, selector, screenshot path | Playwright/Cypress output |
| Coverage report | huge file table、all green rows | threshold failures, uncovered top-k, summary table | uncovered lines, threshold, file path | coverage parser |
| Lint output | repeated rule metadata、many same warnings | group by rule/file, top instances, fixable count | exact file:line:col, rule id, severity | ESLint/Ruff |
| Typecheck output | repeated TS errors、long generic types | group by error code, collapse repeated instantiations, keep first full instance | file:line, TS code, type names | compiler diagnostics |
| Stack trace | node_modules frames、async wrappers、repeated cause chains | project-frame retain, external-frame fold, cause signature digest | top error, project frames, line numbers, cause | stack parsers |
| Service log | timestamp/level/request id repeated | Drain template + variant table, rare event retention, severity priority | ERROR/WARN/FATAL, ordering, correlation IDs | Drain/Drain3 |
| Access log | IP/path/status repeated | field schema table, status/path aggregation, outlier retain | 5xx/4xx, path, latency extremes | log analytics |
| Audit/security log | repeated principals/actions | actor/action/resource table, failed/privileged event retain | actor, action, resource, timestamp | SIEM patterns |
| Progress bars | carriage-return frames、spinner ANSI | final-frame selection, ANSI strip | final status, error line after progress | terminal parser |
| Package install log | download/extract progress、peer warning repeats | progress fold、warning grouping、dependency conflict retain | peer conflicts, lifecycle script errors | npm/pnpm/yarn |
| Benchmark output | repeated samples、large tables | p50/p95/p99 summary, regression diff, raw marker | sample size, variance, environment | perf tooling |
| Profiler trace | thousands of events | flamegraph top-k, aggregate by function, critical path | timestamps if race, top hot functions | profiling |
| HAR/network trace | repeated headers/cookies, many 200s | request table, status/error focus, header dictionary | failed requests, auth redaction, timing | browser tooling |

### 6. Git、搜索与文件系统观察

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| `git status` | repeated path states、untracked build dirs | state table, ignored/generated summarization | staged/unstaged distinction, branch, conflicts | git porcelain |
| `git log` | long messages、repeated merge commits | range summary, first-parent option, commit table | SHA, author/date if relevant, breaking/security commits | git log |
| `git show` | full patch when only metadata needed | metadata-first, patch-on-demand, hunk marker | changed files, exact patch for edit review | git tooling |
| `git diff --stat` | already compact but can include generated | generated collapse, risk-ranked files | file path, add/delete counts | git diff |
| `rg` search results | many duplicate matches、vendored/generated hits | path grouping, context budget, exact match snippets, ignore generated | line numbers, match text, nearby symbols | ripgrep |
| `find`/tree | large vendor/build folders | depth budget, file-count summary, path prefix compression | config files, hidden rules, source roots | filesystem |
| Directory listing | permissions/date columns repeated | name/type/size table, sort by relevance | symlink target, executable bit, hidden files | ls parser |
| File read slices | overlapping reads, same file rereads | range merge/dedup, last-read map, raw exact marker | line numbers, latest file version/hash | DCP-like history |
| Binary detection | null bytes, huge blobs | metadata only: type/size/hash; OCR/extract via tool if requested | hash, path, format, dimensions | file magic |

### 7. Agent 历史、任务状态与 compaction

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| Repeated tool calls | identical output appears many turns | exact hash dedup + later-call reference | latest output, call id, args, session | OpenCode DCP |
| Failed retries | same stack/error repeated | error signature digest: type/message/count/project frames/attempted fixes | latest full error, failed fix attempts | DCP + stack folding |
| Completed subtasks | old exploration, resolved questions | task snapshot: goal/outcome/evidence/files/risks | user requirements, unresolved items | compaction hooks |
| Planning chatter | obsolete plans, repeated todos | last-write-wins plan projection, completed item fold | current next action, blockers | lifecycle projection |
| Tool result chains | read → edit → test → read loops | state transition summary, raw markers for large outputs | edit locations, test failures | event projection |
| Sub-agent transcript | full sub-agent reasoning/output | subtask report: ask, actions, files, result, residual risk | decisions, evidence, errors | hierarchical summary |
| Compaction summary | summary grows over time | summary diff, pinned facts, contradiction check | exact user goals, current branch, test failures | Claude/OpenCode compaction patterns |
| Long conversation | repeated confirmations, status updates | role-aware dedup, decision log, open question list | user instructions, approvals, constraints | prompt compression |
| Tool schema history | same tool definitions every request | stable prefix cache, tool shortlist, meta-tool dispatcher | tool call correctness, required schema | MCP schema optimization |

### 8. UI、图片、附件与多媒体派生文本

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| Screenshot OCR | UI chrome, repeated menu items, OCR noise | layout tree, visible text grouping, bounding-box table, relevance selection | error messages, selected controls, coordinates | computer-use/OCR |
| UI screenshot object list | many decorative elements | semantic object grouping, affordance-focused summary | buttons/inputs/status/error, spatial relation | vision model output |
| Diagram image | visual style, redundant shapes | graph extraction: nodes/edges/labels, hierarchy summary | labels, edge direction, legend | diagram parsers/vision |
| Video transcript | filler, timestamps, repeated frames | keyframe selection, scene summary, transcript action extraction | timestamps for events, commands shown | video summarization |
| Audio transcript | filler, speaker noise | diarization + action/decision extraction | speaker, decisions, deadlines | meeting compression |
| Attachments bundle | many files irrelevant | manifest, MIME grouping, relevance-ranked extraction | filenames, hashes, user-mentioned files | document ingestion |

### 9. 数据库、监控与生产诊断

| 文档/对象类型 | 低密度特征 | 推荐压缩算法 | 必须保护 | 可参考对象 |
|---|---|---|---|---|
| SQL query result | wide rows, repeated values | schema + sample + outlier rows, aggregation by key | row count, nulls, false/0, ordering if meaningful | dataframe profiling |
| Query plan | repeated cost fields, tree indentation | plan tree compression, hot path extraction | join order, scan type, estimated/actual rows | EXPLAIN parser |
| Prometheus metrics | label repetition, long series | metric family summary, label dictionary, anomaly windows | metric name, labels, spikes, time range | time-series compression |
| OpenTelemetry trace | many spans, repeated attrs | critical path, service graph, error spans, attr dictionary | trace/span IDs, error status, latency | tracing tools |
| Kubernetes events | repeated Normal events | warning/error focus, count aggregation, latest event | involved object, reason, timestamp | kubectl |
| Cloud logs | metadata envelope repeated | envelope field hoist, message template mining | project/region/resource, severity | logging systems |
| Incident timeline | chat + alerts + deploys mixed | timeline normalization, causal chain extraction | exact times, actors, rollback points | incident postmortem |

## 适合本插件的实现优先级

| 优先级 | 场景 | 原因 | 建议落地 |
|---|---|---|---|
| P0 | Shell test/build/log/progress/stack | 高频、高收益、可规则化、已有 raw store 恢复 | 继续扩展命令识别与 fixture |
| P0 | `token_save_read` 的 code/log/markdown/json/xml/instruction | 与需求直接相关；可由用户选择探索工具避免编辑风险 | 保持 native read 不动；增强 mode-specific compressor |
| P0 | 历史重复工具输出与重复错误 | 长任务中膨胀明显；可 deterministic | exact hash、error digest、recent window |
| P1 | 网页 HTML/WebFetch | HTML/markdown 噪声极大；Readability 类算法成熟 | DOM main-content extraction + code/table/admonition 保留 |
| P1 | Tool schema / MCP schema | schema token 是固定税；多工具场景收益大 | tool shortlist、schema distillation、danger tool full schema |
| P1 | Repo map / code skeleton | 适合探索大型仓库 | Tree-sitter/LSP 可选 adapter；失败回退 lexical |
| P1 | JSONL/NDJSON/log analytics | Agent 常读 trace、日志、API dump | schema+rows + template mining + rare event retention |
| P2 | PDF/Docx/Slides/Notebook | 价值高但解析依赖重、格式多 | 独立 adapter，默认不作为核心依赖 |
| P2 | Learned compression | 对自然语言 docs/history 有潜力 | 仅用于非强约束文本，必须 query-aware 且可关闭 |
| P3 | Full event-sourced history | 审计强但复杂 | 保留事件语言，不做核心路径 |

## 通用异常处理规则

1. **强约束优先**：MUST/NEVER/禁止/不要、权限、路径、命令、输出格式、例外条件不做 learned token pruning。
2. **编辑前保真**：探索视图不能直接作为 edit/write/apply_patch 的唯一依据；修改前回读原文。
3. **secret-like 原样透传**：疑似 token/private key/password 的内容不压缩、不落 raw store。
4. **结构数据 exact gate**：JSON/XML/YAML exact 模式必须 round-trip；失败原文。
5. **收益 gate 计入 wrapper/marker**：raw id、header、恢复说明都算进 compressed token。
6. **recent window 保护**：刚产生的工具输出、最新错误、当前任务状态默认不压缩。
7. **稀有/失败优先**：ERROR/WARN/FATAL、失败测试、非零退出、极值、罕见状态必须保留完整实例。
8. **外部依赖可选**：Tree-sitter、LLMLingua、OCR、PDF parser 等重型能力必须可选、超时、fail-open。
9. **缓存友好**：历史重写尽量在 compaction 或明确 prune 边界批量发生，避免每轮扰动 prompt prefix。
10. **可恢复**：有损压缩默认应提供 raw id 或可复现查询；无 raw store 时降级为保守压缩。

## Compressor registry 建议标签

为了让代码可扩展，每个 compressor 注册时建议声明：

```ts
{
  id: "shell.test-pass-fold",
  contentKinds: ["shell"],
  fidelity: "edit-safe",
  lossy: true,
  requiresRawStore: true,
  protects: ["failures", "warnings", "file:line", "exit-status"],
  skipsWhen: ["secret-like", "verbose", "savings-below-threshold"],
  metrics: ["token-saving", "critical-recall", "p95-latency"]
}
```

这样 benchmark 可以按 `id` 聚合，而不是只按“read/shell/history”粗分类看收益。
