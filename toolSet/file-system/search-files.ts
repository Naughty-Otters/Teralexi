import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  requireActiveSandbox,
  resolvePathInContext,
  getWorkspacePathFromEnv,
  sandboxPathError,
} from '../sandbox-paths'
import { FILE_SYSTEM_TAG, WORKSPACE_PATH_HINT } from './constants'
import { toToolAbsolutePath } from './file-io-utils'
import {
  includePackageFilesField,
  parseIncludePackageFiles,
  shouldSkipListingEntry,
} from './workspace-scan-filters'

export const searchFiles: SkillTool = {
  name: 'search_files',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Search for files by name or content in the user project tree. ${WORKSPACE_PATH_HINT} By default skips node_modules, Python package dirs, and hidden paths. Prefer grep_files for regex content search and glob_files for filename patterns.`,
  inputSchema: z.object({
    path: z.string().min(1),
    query: z.string().min(1),
    matchContent: z.boolean().optional(),
    maxDepth: z.number().min(1).optional(),
    include_package_files: includePackageFilesField,
  }),
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const targetPath = input['path']
    const rawQuery = input['query']
    const matchContent = Boolean(input['matchContent'])
    const maxDepth = Number(input['maxDepth'] ?? 3)
    const includePackageFiles = parseIncludePackageFiles(input)

    if (typeof targetPath !== 'string' || typeof rawQuery !== 'string') {
      return null
    }

    let resolvedPath: string
    try {
      resolvedPath = resolvePathInContext(sandbox.root, workspacePath, targetPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    const query = rawQuery as string
    const results: Array<Record<string, unknown>> = []

    async function scan(dir: string, depth: number) {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (
          shouldSkipListingEntry(
            entry.name,
            entry.isDirectory(),
            includePackageFiles,
          )
        ) {
          continue
        }
        const entryPath = path.join(dir, entry.name)
        if (entry.name.includes(query)) {
          results.push({
            path: toToolAbsolutePath(entryPath),
            type: entry.isDirectory() ? 'directory' : 'file',
            match: 'name',
          })
        }

        if (matchContent && entry.isFile()) {
          try {
            const content = await fs.readFile(entryPath, 'utf-8')
            if (content.includes(query)) {
              results.push({
                path: toToolAbsolutePath(entryPath),
                type: 'file',
                match: 'content',
              })
            }
          } catch {
            // ignore unreadable files
          }
        }

        if (entry.isDirectory() && depth < maxDepth) {
          await scan(entryPath, depth + 1)
        }
      }
    }

    try {
      await scan(resolvedPath, 1)
      return {
        path: toToolAbsolutePath(resolvedPath),
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        query: rawQuery,
        results,
      }
    } catch (error) {
      return { error: String(error) }
    }
  },
}
