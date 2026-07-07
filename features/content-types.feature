# language: zh-CN
功能: 针对不同 Context 对象选择专用压缩算法

  场景: 指令中的否定约束受保护
    假如 AGENTS.md 同时包含 MUST 和 MUST NOT 规则
    当执行指令压缩
    那么两条规则都必须保留
    并且不得因文本相似而合并

  场景: 同构 JSON 数组转为 schema 和 rows
    假如 JSON 包含大量具有相同字段的对象
    当使用 exploratory 结构压缩
    那么输出应只声明一次字段 schema
    并且每一行的标量值都可定位
    并且错误状态和稀有值应保留

  场景: JSON exact 模式可往返
    假如任意有效 JSON
    当执行 exact canonicalization 后再解析
    那么得到的数据应与原数据深度相等

  场景: XML preserve 模式回退
    假如 XML 包含 xml:space preserve 或 mixed content
    当执行 XML 压缩
    那么不得折叠文本空白

  场景大纲: 四种代码语言保留关键结构
    假如一个 <语言> 文件
    当生成探索结构视图
    那么应保留 <关键结构>

    例子:
      | 语言   | 关键结构                       |
      | C      | 预处理器、类型和函数签名         |
      | C++    | template、namespace 和类签名     |
      | Java   | annotation、继承和方法签名       |
      | Python | decorator、缩进层级和函数签名     |
