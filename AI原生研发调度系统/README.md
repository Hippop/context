# AI 原生研发调度系统

一个独立的、产物驱动的研发 Harness。它在外部编排 Goal Contract、仓库发现、
DDD/ADR/BDD、实现、确定性验证、失败修复和交付报告；Agent 执行引擎默认使用
OpenCode。

## 能力

- Run / Stage 状态机与可追溯的 artifact、evidence。
- OpenCode `plan`、`explore`、`build` Agent 分阶段调度。
- 验证命令、失败分类、修复循环、重试预算和无进展检测。
- JSON workflow，可按项目定制阶段、输入输出和验证命令。
- `--dry-run` 离线检查编排链路，不调用模型或执行项目命令。

## 安装与构建

需要 Node.js 20 或更高版本：

```bash
npm install
npm run check
```

OpenCode CLI 未安装时：

```bash
curl -fsSL https://opencode.ai/install | bash
```

## 使用

```bash
node dist/cli.js run \
  --repo ../service-auth \
  --requirement ../service-auth/requirements/feature.md \
  --workflow workflows/feature-delivery.json \
  --model provider/model \
  --auto
```

离线 dry-run：

```bash
node dist/cli.js run \
  --repo /path/to/repository \
  --requirement "增加短信验证码登录" \
  --dry-run
```

查询执行结果：

```bash
node dist/cli.js status RUN-... --runs-dir /path/to/repository/.ai-harness/runs
node dist/cli.js report RUN-... --runs-dir /path/to/repository/.ai-harness/runs
```

产物默认写入目标仓库的 `.ai-harness/runs/<run-id>/`：

- `run.json`：Run 和 Stage 状态索引。
- `artifacts/`：Goal、DDD、ADR、BDD、实现结果、诊断和最终报告。
- `evidence/`：Agent 调用、命令执行与报告证据。

## OpenCode

默认执行形式：

```bash
opencode run \
  --dir <repo> \
  --format json \
  --agent <plan|explore|build> \
  --model <provider/model> \
  --auto \
  "<stage prompt>"
```

可通过 `--opencode-command` 指定 OpenCode 可执行文件，通过
`--model` 选择模型。未传 `--auto` 时不会自动批准 Agent 权限。
