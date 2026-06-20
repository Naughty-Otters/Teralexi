import { promises as fs } from 'fs'
import path from 'path'
import fg from 'fast-glob'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  requireActiveSandbox,
  resolvePathInContext,
  getWorkspacePathFromEnv,
  sandboxPathError,
} from '../sandbox-paths'
import { createLogger } from '@main/logger'
import {
  FILE_SYSTEM_TAG,
  MAX_GLOB_PATHS,
  SANDBOX_ARTIFACT_HINT,
  WORKSPACE_PATH_HINT,
} from './constants'
import { runRipgrepFiles } from './ripgrep'
import { matchPathToDisplayPath, toToolAbsolutePath } from './file-io-utils'
import {
  fastGlobIgnorePatterns,
  includePackageFilesField,
  parseIncludePackageFiles,
  ripgrepExcludeGlobArgs,
  shouldSkipRelativePath,
} from './workspace-scan-filters'

const log = createLogger('toolSet:glob_files')

async function nodeGlobFallback(
  root: string,
  pattern: string,
  includePackageFiles: boolean,
): Promise<Array<{ path: string; mtime: number }>> {
  const matches = await fg(pattern, {
    cwd: root,
    dot: includePackageFiles,
    onlyFiles: true,
    absolute: false,
    ignore: fastGlobIgnorePatterns(includePackageFiles),
  })

  const withMtime = await Promise.all(
    matches.map(async (rel) => {
      try {
        const stats = await fs.stat(path.join(root, rel))
        return { path: rel, mtime: stats.mtimeMs }
      } catch {
        return { path: rel, mtime: 0 }
      }
    }),
  )

  withMtime.sort((a, b) => b.mtime - a.mtime)
  return withMtime
}

export const globFiles: SkillTool = {
  name: 'glob_files',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Find files by glob pattern in the user project (e.g. "**/*.ts"). ${WORKSPACE_PATH_HINT}${SANDBOX_ARTIFACT_HINT} By default skips node_modules, Python package dirs, and hidden paths. Returns up to 100 paths sorted by modification time (newest first).`,
  inputSchema: z.object({
    pattern: z.string().min(1),
    path: z.string().min(1).optional(),
    include_package_files: includePackageFilesField,
  }),
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const pattern = input['pattern']
    const searchPath = (input['path'] as string | undefined) ?? '.'
    const includePackageFiles = parseIncludePackageFiles(input)

    if (typeof pattern !== 'string' || pattern.trim() === '') {
      return { error: 'Invalid pattern: expected a non-empty glob string.' }
    }

    let resolvedPath: string
    try {
      resolvedPath = resolvePathInContext(sandbox.root, workspacePath, searchPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    try {
      log.info('glob_files started', {
        sandboxRoot: sandbox.root,
        searchPath: resolvedPath,
        pattern,
        engine: 'ripgrep',
      })

      const rgResult = await runRipgrepFiles(
        ['-g', pattern, ...ripgrepExcludeGlobArgs(includePackageFiles)],
        resolvedPath,
      )
      let paths = rgResult.paths.filter(
        (p) => !shouldSkipRelativePath(p, includePackageFiles),
      )
      let usedFallback = false
      let engine: 'ripgrep' | 'node-fallback' = 'ripgrep'

      if (!rgResult.available) {
        log.warn('glob_files switching to Node fallback', {
          searchPath: resolvedPath,
          pattern,
          ripgrepError: rgResult.error ?? 'unknown',
        })
        const fallback = await nodeGlobFallback(
          resolvedPath,
          pattern,
          includePackageFiles,
        )
        usedFallback = true
        engine = 'node-fallback'
        paths = fallback.map((f) => f.path)
        log.info('glob_files Node fallback completed', {
          searchPath: resolvedPath,
          pattern,
          pathCount: paths.length,
        })
      } else if (paths.length > 0) {
        const withMtime = await Promise.all(
          paths.map(async (filePath) => {
            const abs = path.isAbsolute(filePath)
              ? filePath
              : path.join(resolvedPath, filePath)
            try {
              const stats = await fs.stat(abs)
              return { path: abs, mtime: stats.mtimeMs }
            } catch {
              return { path: abs, mtime: 0 }
            }
          }),
        )
        withMtime.sort((a, b) => b.mtime - a.mtime)
        paths = withMtime.map((p) => p.path)
      }

      const truncated = paths.length > MAX_GLOB_PATHS
      const limited = paths.slice(0, MAX_GLOB_PATHS).map((absPath) =>
        matchPathToDisplayPath(absPath, resolvedPath, sandbox.root, workspacePath),
      )

      const result: Record<string, unknown> = {
        path: toToolAbsolutePath(resolvedPath),
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        pattern,
        count: limited.length,
        paths: limited,
      }

      if (truncated) {
        result.note = `Results truncated at ${MAX_GLOB_PATHS} paths.`
      }
      if (usedFallback) {
        result.note = [result.note, 'Used Node fallback (ripgrep unavailable).']
          .filter(Boolean)
          .join(' ')
      }

      log.info('glob_files completed', {
        searchPath: resolvedPath,
        pattern,
        engine,
        pathCount: limited.length,
        truncated,
        usedFallback,
      })

      return result
    } catch (error) {
      log.warn('glob_files failed', {
        searchPath: resolvedPath,
        pattern,
        error: String(error),
      })
      return { error: String(error) }
    }
  },
}
