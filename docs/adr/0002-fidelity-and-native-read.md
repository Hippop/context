# ADR-0002：保留原生 Read，探索读取与编辑读取分离

- 状态：Accepted
- 日期：2026-07-06

## 决策

不通过 hook 压缩 native `read`。提供 `token_save_read`，默认输出 exploratory view，并在输出和工具描述中要求编辑前用 native `read` 回读精确目标范围。

代码采用两级表示：

- symbol skeleton/压缩视图用于定位；
- 原始源代码用于 edit/write/apply_patch。

## 理由

Read 通常是 Edit 的前置条件。压缩掉注释、缩进、宏或附近行会造成错误编辑，其补救 token 可能远高于节省值。显式工具也允许权限、指标和模型行为测试分别进行。

## 后果

模型可能仍选择 native read，节省不稳定；需要通过 tool description、BDD 和 A/B 测试提高探索工具使用率。但正确性优先于透明覆盖率。
