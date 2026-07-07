# ADR-0003：有损输出使用 session 隔离的可恢复存储，并在边界批量清理历史

- 状态：Accepted
- 日期：2026-07-06

## 决策

默认开启 raw store。Shell 有损压缩前必须成功保存原文；marker 只在同一 session 可读取，支持 TTL、容量淘汰和分页。secret-like 内容不压缩、不存储。

历史去重输出必须确定，并优先在显式 compress/compaction 边界批量改变旧消息，最近窗口保持稳定，以降低 prompt cache 失效。

## 被否决的方案

- 把原文写入仓库 `.opencode/`：污染工作树并扩大泄露范围；
- 全局 raw ID：存在跨 session 数据读取风险；
- 存储失败仍返回有损结果：无法恢复，不满足安全契约；
- 每轮重新摘要全部历史：延迟高且破坏 exact-prefix cache。

## 后果

需要用户缓存空间和清理任务；marker 本身消耗少量 token，因此最终收益 gate 必须把 marker 计入。
