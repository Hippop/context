import { readFile } from "node:fs/promises"
import path from "node:path"
import type { WorkflowSpec } from "./types.js"

export const DEFAULT_WORKFLOW: WorkflowSpec = {
  id: "feature-delivery",
  version: 1,
  stages: [
    {
      id: "goal",
      type: "agent",
      agent: "requirement-agent",
      opencodeAgent: "plan",
      outputs: ["goal_contract"],
      prompt: "将原始需求转成 Goal Contract：目标、范围、验收、禁止项、DoD、未决问题。输出 JSON 或结构化 Markdown。",
    },
    { id: "repository", type: "repository_discovery" },
    {
      id: "domain",
      type: "agent",
      agent: "domain-agent",
      opencodeAgent: "explore",
      inputs: ["goal_contract", "repository_map"],
      outputs: ["domain_model"],
      prompt: "基于 Goal 与仓库地图生成简化 DDD：限界上下文、统一语言、不变量、领域事件、代码映射和风险。",
    },
    {
      id: "architecture",
      type: "agent",
      agent: "architecture-agent",
      opencodeAgent: "plan",
      inputs: ["goal_contract", "repository_map", "domain_model"],
      outputs: ["adr"],
      prompt: "生成 ADR 候选：至少两个方案、取舍、决策、后果、实现约束和需要人工批准的风险。",
    },
    {
      id: "behavior",
      type: "agent",
      agent: "behavior-agent",
      opencodeAgent: "plan",
      inputs: ["goal_contract", "domain_model", "adr"],
      outputs: ["bdd", "test_matrix"],
      prompt: "把验收标准转成 Given-When-Then 场景和测试矩阵，覆盖 happy path、边界、异常和权限。",
    },
    {
      id: "implementation",
      type: "agent",
      agent: "code-agent",
      opencodeAgent: "build",
      inputs: ["goal_contract", "repository_map", "domain_model", "adr", "bdd", "test_matrix"],
      outputs: ["implementation_result"],
      prompt: "在上游约束下完成最小代码与测试修改。不要修改验收来适配实现；输出变更摘要、假设和验证命令。",
    },
    {
      id: "verification",
      type: "verification_loop",
      agent: "fix-agent",
      opencodeAgent: "build",
      commands: ["npm run typecheck", "npm test"],
      maxIterations: 3,
      noProgressWindow: 2,
    },
    { id: "delivery", type: "report" },
  ],
}

export async function loadWorkflow(workflowPath?: string): Promise<WorkflowSpec> {
  if (!workflowPath) return DEFAULT_WORKFLOW
  const raw = await readFile(path.resolve(workflowPath), "utf8")
  return JSON.parse(raw) as WorkflowSpec
}
