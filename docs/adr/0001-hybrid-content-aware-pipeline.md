# ADR-0001：采用内容感知、可恢复的混合压缩管线

- 状态：Accepted
- 日期：2026-07-06
- 决策者：Context Density Plugin maintainers

## 背景

OpenCode Context 同时包含高风险指令、代码、结构数据、重复日志、Shell 结果和历史消息。统一截断或统一 LLM 摘要无法同时满足延迟、成本、确定性和保真要求。

## 候选方案

### A. 纯正则/规则

优点：快、确定、零模型成本。缺点：跨语言扩展困难，对 docs/history 的语义选择弱。

### B. 通用 learned token pruning

优点：适合自然语言，算法统一。缺点：延迟与模型依赖较高，可能删除否定词、字段名和操作符，难以证明可逆。

### C. 内容路由 + 专用 compressor + 可恢复存储

优点：可以为每类内容声明保真契约；高频路径使用规则/AST；自然语言再选择检索或 learned fallback。缺点：组件更多，需要 corpus 和路由测试。

### D. 只接入外部 CLI proxy（如 RTK）

优点：Shell 覆盖广、实现成熟。缺点：无法治理 skills、AGENTS、Read、JSON/XML 和历史；增加部署依赖。

## 决策

选择 C，并允许在 Shell classifier 命中时可选委托 RTK。管线为：

```text
Injection Point
 → Classifier
 → Safety/Secret Gate
 → Fidelity Contract
 → Specialized Stages
 → Savings + Critical-Fact Gate
 → Raw Store (when lossy)
 → Compressed View + Metrics
```

### OpenCode 接入方式

- `token_save_read`：显式 exploratory 读取，不覆盖 native read；
- `tool.execute.after`：处理 native shell 输出；
- `experimental.chat.messages.transform`：生成历史的压缩视图；
- `experimental.session.compacting`：注入摘要保留规则；
- `context_raw` / `context_report`：恢复与观测。

## 后果

正面：安全边界清晰；可逐类扩展；压缩失败不影响 Agent；可以精确评测。  
负面：维护多个 parser；需要持续更新命令格式；更高测试成本。  
风险缓解：每个 compressor 必须有保护字段、异常 corpus、收益阈值和 fail-open 测试。
