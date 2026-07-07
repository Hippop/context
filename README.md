# opencode-context-density

一个不修改 OpenCode 源码的 Context 信息密度提升插件。它在 OpenCode 的公开插件注入点上做保守、可恢复、可测量的压缩。

## 已实现

- `token_save_read`：按代码、日志、Markdown 分类压缩的探索读取工具；原生 `read` 完全不动，修改前必须回读原文。
- 指令与结构数据：识别 SKILL/commands/agents/AGENTS.md、JSON 和 XML；提供精确去重、schema+rows、保守 XML 空白处理。
- Shell 后处理：折叠测试通过项、构建进度、ANSI/进度帧、重复行、日志前缀和第三方栈帧；错误、失败摘要和项目栈帧保留。
- 代码探索压缩：在非 Python 代码中折叠长函数体的低密度实现行，保留签名、闭合结构和关键 `return`/`throw`/`await`/安全注释线；Python 维持缩进/docstring 保守策略。
- `context_raw`：分页恢复被压缩的 Shell 原文。原文默认存到用户缓存目录，不污染仓库，并设置为仅当前用户可读。
- 历史去重：只清理白名单工具的旧且完全重复输出；保留最近窗口；重复错误按签名折叠。
- compact 增强：在 `experimental.session.compacting` 中注入“已解决任务 / 重复错误 / 原始观察 ID”的摘要规则。
- `context_report`：输出估算 token 节省、压缩耗时和观测到的自动 compact 次数。
- 单元测试与确定性 benchmark：token 节省、延迟、128k 窗口持久性都可复现。

需求领域模型见 [需求规格](docs/requirements.md)，算法与异常矩阵见 [算法调研](docs/compression-algorithms.md)，架构说明见 [Architecture](docs/architecture.md)，架构决策见 [`docs/adr/`](docs/adr/)（尤其是代码可理解性/可扩展性决策 [ADR-0004](docs/adr/0004-code-architecture-for-understandability-and-extensibility.md)），BDD 见 [行为规格](docs/bdd.md)，实际结果见 [Benchmark 报告](docs/benchmark-results.md)，逐项目标验收见 [交付审计](docs/delivery-audit.md)。

## 安装

发布到 npm 后，在项目的 `opencode.json` 中配置：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-context-density"]
}
```

带参数的完整例子见 [`examples/opencode.json`](examples/opencode.json)。本地开发时也可以将编译后的模块放到 `.opencode/plugins/`，或从该目录导出默认插件。

本仓库已经通过 `.opencode/plugins/context-density.ts` 完成项目级开发安装；先在仓库根目录执行 `bun install`，随后在仓库目录启动 OpenCode 会自动加载源码插件。依赖保留在根 `package.json`，避免 OpenCode 为 `.opencode/package.json` 再启动一份后台安装。

纯压缩函数从 `opencode-context-density/api` 导入；包根入口只导出插件，避免 OpenCode 把普通函数误识别成多个 plugin factory。

```ts
export { default } from "opencode-context-density"
```

## 使用

Agent 会看到三个新工具：

- `token_save_read`：探索、定位、理解结构时使用。
- `context_raw`：压缩结果缺细节时，使用结果中的 raw id 找回原文。
- `context_report`：查看当前 session 的压缩收益。

Shell 使用原生 `bash` 即可，插件通过 `tool.execute.after` 透明处理输出。带 `--verbose`、`--debug`、`--trace` 或 `-vv` 的命令默认不做命令级有损折叠。

## 安全策略

- 原生 `read` 不受影响。
- 疑似包含 API key、token、密码或私钥的输出完全不压缩，也不落原文缓存。
- 低于 `minChars` 或达不到 `minSavingsRatio` 的结果原样返回。
- `token_save_read` 只允许读取当前 worktree 内的普通文本文件，并执行 OpenCode 的 `read` 权限确认。
- 原始 Shell 输出按 session 隔离，默认保留 7 天、每个 session 最多 50 MiB。

## 开发与验证

```bash
npm install
npm run check
npm run benchmark
# 有 OpenCode CLI 与模型凭据时，再运行真实 AI A/B：
npm run benchmark:ab -- --model provider/model --runs 5 --rounds 3
```

核心设计使用 [OpenCode 插件文档](https://opencode.ai/docs/zh-cn/plugins/)的公开 hooks/custom tools。Shell 压缩参考了 RTK 一类工具的命令感知、保守回退和收益统计思路，但不直接引用 RTK 或其他压缩框架；本实现独立工作，不要求安装 RTK。

## 当前边界

- token 统计是快速、provider-neutral 的估算值；真实 A/B 必须使用 OpenCode/provider 的实际 usage。
- 第一版只对高置信度测试、构建和日志形态做语义折叠；`git diff` 等修改敏感输出保持原样（仅可能做 ANSI、重复行等通用清理）。
- 历史变换不猜测“子任务已经解决”，而把这种判断交给 OpenCode compaction LLM，避免规则误删未解决事实。
- 当前代码探索压缩仍是保守 lexical 策略；ADR 中的 Tree-sitter symbol skeleton 是下一阶段实现，不在本版宣称范围内。
