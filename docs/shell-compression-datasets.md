# Shell 压缩测试数据集

日期：2026-07-08

当前已经有 shell 压缩测试数据集，位于：

- `tests/fixtures/shell-fixtures.ts`
- 数据集驱动测试：`tests/shell.test.ts`

这个数据集覆盖的是“代码已经实现”的能力，而不是未来规划能力。每条 fixture 包含：

- `name`：样本名；
- `command`：触发命令；
- `raw`：原始命令输出；
- `shouldApply`：是否应压缩；
- `expectedStages`：期望触发的压缩 stage；
- `mustContain`：压缩后必须保留的关键事实；
- `mustNotContain`：压缩后不应再出现的低密度内容；
- `minSavedPercent`：最低 token 节省率门槛。

## 覆盖矩阵

| Fixture | 命令 | 覆盖能力 | 关键保护 |
|---|---|---|---|
| `pytest-passed-fold-preserves-failure` | `pytest` | `test-pass-fold` | failed test、assertion、summary |
| `vitest-checkmark-fold-preserves-summary` | `pnpm test` | checkmark passed folding | failed scenario、expected status、summary |
| `go-test-pass-fold` | `go test ./...` | Go test pass folding | failed test、file line、FAIL |
| `build-progress-fold-preserves-rust-error` | `cargo build` | `build-progress-fold` | Rust error code、file line、final status |
| `progress-carriage-return-final-frame` | `npm install` | `progress-final-frame`、duplicate line fold | final progress、done line |
| `ansi-strip-and-blank-collapse` | `node script.js` | ANSI strip、duplicate line fold、blank collapse | error text |
| `external-stack-frame-fold` | `node app.js` | third-party stack frame folding | project frames、error message |
| `log-template-fold-preserves-error` | `kubectl logs` | log template + variants table | ERROR line |
| `timestamp-prefix-fold-preserves-warn-error` | `journalctl` | timestamp/level prefix folding | WARN/ERROR 原文 |
| `secret-like-output-fail-open` | `env` | secret-like fail-open | secret 原文、不压缩 |
| `verbose-build-preserved` | `cargo build --verbose` | verbose/debug protection | 原始 verbose 输出 |

## 数据集样本示例

```ts
{
  name: "pytest-passed-fold-preserves-failure",
  command: "pytest",
  raw: "...120 PASSED lines...\nFAILED\nAssertionError\n120 passed, 1 failed",
  shouldApply: true,
  expectedStages: ["test-pass-fold"],
  mustContain: ["120 passing-test lines folded", "FAILED", "AssertionError"],
  mustNotContain: ["tests/test_user.py::test_case_119 PASSED"],
  minSavedPercent: 80
}
```

## 已覆盖但仍可增强的方向

已经有数据集覆盖：

- 测试 passed 折叠；
- 构建 progress 折叠；
- ANSI strip；
- carriage-return 进度条最终帧；
- 连续重复行折叠；
- 连续空行折叠；
- 日志模板折叠；
- timestamp/level 前缀折叠；
- 第三方 stack frame 折叠；
- secret-like fail-open；
- verbose/debug 保护；
- raw store gate 在 core pipeline 测试中覆盖。

后续建议补充但当前代码尚未实现专用 parser 的数据集：

- `git status` / `git log` / `git diff`；
- ESLint/Ruff lint 输出；
- TypeScript/Rust/Java typecheck 输出；
- coverage report；
- npm/pnpm/yarn install peer warning；
- GitHub Actions CI failed job；
- HAR/network trace；
- profiler trace。
