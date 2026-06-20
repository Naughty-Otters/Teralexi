import { promises as fs } from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
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

const execFileAsync = promisify(execFile)

export const listFiles: SkillTool = {
  name: 'list_files',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `List files and directories in the user project at the given path. ${WORKSPACE_PATH_HINT} By default skips node_modules, Python package dirs, and hidden files; set include_package_files=true to include them.`,
  inputSchema: z.object({
    path: z.string().min(1),
    recursive: z.boolean().optional().default(false),
    maxDepth: z.number().min(1).optional().default(1),
    include_package_files: includePackageFilesField,
  }),
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const targetPath = input['path']
    const recursive = Boolean(input['recursive'])
    const maxDepth = Number(input['maxDepth'] ?? 1)
    const includePackageFiles = parseIncludePackageFiles(input)

    if (typeof targetPath !== 'string' || targetPath.trim() === '') {
      return null
    }

    let resolvedPath: string
    try {
      resolvedPath = resolvePathInContext(sandbox.root, workspacePath, targetPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    async function listDir(dir: string, depth: number) {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const results: Array<Record<string, unknown>> = []

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
        const item: Record<string, unknown> = {
          name: entry.name,
          path: toToolAbsolutePath(entryPath),
          type: entry.isDirectory() ? 'directory' : 'file',
        }
        if (entry.isFile()) {
          const stats = await fs.stat(entryPath)
          item.size = stats.size
          item.modifiedAt = stats.mtime.toISOString()
        }
        results.push(item)

        if (recursive && entry.isDirectory() && depth < maxDepth) {
          item.children = await listDir(entryPath, depth + 1)
        }
      }

      return results
    }

    try {
      return {
        path: toToolAbsolutePath(resolvedPath),
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        entries: await listDir(resolvedPath, 1),
      }
    } catch (error) {
      return { error: String(error) }
    }
  },
}

export const storageCheck: SkillTool = {
  name: 'storage_check',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Check available disk space for a path in the user project or sandbox. ${WORKSPACE_PATH_HINT}`,
  inputSchema: z.object({
    path: z.string().min(1).optional(),
  }),
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    let targetPath = sandbox.root
    if (typeof input['path'] === 'string' && input['path'].trim() !== '') {
      try {
        targetPath = resolvePathInContext(sandbox.root, workspacePath, input['path'] as string)
      } catch (err) {
        return sandboxPathError(err)
      }
    }

    try {
      const { stdout } = await execFileAsync('df', ['-k', targetPath], {
        shell: true,
        maxBuffer: 1020 * 1024 * 1024,
      })
      const parsed = stdout
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => {
          const parts = line.split(/\s+/)
          return {
            filesystem: parts[0],
            blocks: Number(parts[1]),
            used: Number(parts[2]),
            available: Number(parts[3]),
            usePercent: parts[4],
            mountedOn: parts[5],
          }
        })
      return { path: targetPath, sandboxRoot: sandbox.root, data: parsed }
    } catch (error) {
      return {
        path: targetPath,
        sandboxRoot: sandbox.root,
        error: String(error),
        note: 'Storage check is currently supported on POSIX systems via df.',
      }
    }
  },
}

export const fileStatus: SkillTool = {
  name: 'file_status',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Retrieve metadata for a file or directory in the user project. ${WORKSPACE_PATH_HINT}`,
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const targetPath = input['path']
    if (typeof targetPath !== 'string' || targetPath.trim() === '') {
      return null
    }

    let resolvedPath: string
    try {
      resolvedPath = resolvePathInContext(sandbox.root, workspacePath, targetPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    try {
      const stats = await fs.stat(resolvedPath)
      return {
        path: toToolAbsolutePath(resolvedPath),
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        permissions: (stats.mode & 0o777).toString(8),
      }
    } catch (error) {
      return { error: String(error) }
    }
  },
}
