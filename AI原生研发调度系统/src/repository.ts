import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

export interface RepositoryMap {
  modules: string[]
  entrypoints: string[]
  packageScripts: Record<string, string>
  testFiles: string[]
  contractFiles: string[]
  featureFiles: string[]
}

export async function discoverRepository(repo: string): Promise<RepositoryMap> {
  const files = await listFiles(repo, 3)
  const packageScripts = await readPackageScripts(repo)
  return {
    modules: files.filter((file) => /^src\/[^/]+/.test(file)).slice(0, 80),
    entrypoints: files.filter((file) => /^(src\/index|src\/main|src\/cli|package\.json|README\.md)/.test(file)),
    packageScripts,
    testFiles: files.filter((file) => /(^tests?\/|\.test\.|\.spec\.)/.test(file)).slice(0, 100),
    contractFiles: files.filter((file) => /(^contracts\/|openapi|schema|pact)/i.test(file)).slice(0, 100),
    featureFiles: files.filter((file) => /(^features\/|\.feature$)/.test(file)).slice(0, 100),
  }
}

async function readPackageScripts(repo: string): Promise<Record<string, string>> {
  try {
    const packageJson = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8")) as { scripts?: Record<string, string> }
    return packageJson.scripts ?? {}
  } catch {
    return {}
  }
}

async function listFiles(root: string, maxDepth: number): Promise<string[]> {
  const results: string[] = []
  type Utf8Dirent = { name: string; isDirectory(): boolean; isFile(): boolean }
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let entries: Utf8Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join("/")
      if (entry.isDirectory()) {
        await visit(absolute, depth + 1)
      } else if (entry.isFile()) {
        const info = await stat(absolute)
        if (info.size <= 2_000_000) results.push(relative)
      }
    }
  }
  await visit(root, 0)
  return results.sort()
}
