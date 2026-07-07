import { realpath } from "node:fs/promises"
import path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin"

export async function validateReadablePath(filePath: string, worktree: string): Promise<string> {
  const [target, root] = await Promise.all([realpath(filePath), realpath(worktree)])
  const relative = path.relative(root, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("token_save_read only reads files inside the current worktree; use native read for external paths")
  }
  return target
}

export async function askReadPermission(context: ToolContext, safePath: string): Promise<void> {
  await context.ask({
    permission: "read",
    patterns: [path.relative(context.worktree, safePath)],
    always: ["*"],
    metadata: {},
  })
}
