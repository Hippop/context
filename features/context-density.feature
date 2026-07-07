# language: zh-CN
功能: 在不牺牲关键信息的情况下提高 Context 信息密度

  背景:
    假如 Context Density 插件已经加载

  场景: 探索读取代码后提醒精确回读
    假如一个包含长许可证和文档注释的代码文件
    当 Agent 使用 token_save_read 读取文件
    那么返回内容应省略可折叠样板
    并且保留代码行为和符号签名
    并且明确要求编辑前使用原生 read

  场景: 小输出没有足够收益时原文透传
    假如 Shell 输出低于最小字符阈值
    当 Shell after hook 执行
    那么输出应与原文相同
    并且不应创建 raw observation

  场景: 疑似 secret 的输出不压缩也不缓存
    假如 Shell 输出包含 access token
    当 Shell after hook 执行
    那么输出应与原文相同
    并且 raw store 中不应出现该输出

  场景: 有损压缩可恢复
    假如一段可大量折叠的测试输出
    当插件替换 Shell 输出
    那么结果应包含 raw id
    当同一 Session 使用 context_raw 和该 id
    那么应分页得到原始输出

  场景: raw store 写入失败时取消压缩
    假如 raw store 已启用但不可写
    当可压缩 Shell 输出到达
    那么插件应返回原始输出
    并且 Agent 工具调用不应失败
