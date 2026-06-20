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
import {
  FILE_SYSTEM_TAG,
  MAX_GREP_MATCHES,
  MAX_LINE_CHARS,
  SANDBOX_ARTIFACT_HINT,
  WORKSPACE_PATH_HINT,
} from './constants'
import { createLogger } from '@main/logger'
import { truncateLine } from './format-tool-output'
import { matchPathToDisplayPath, toToolAbsolutePath } from './file-io-utils'
import { runRipgrepJson } from './ripgrep'
import {
  includePackageFilesField,
  parseIncludePackageFiles,
  ripgrepExcludeGlobArgs,
  shouldSkipListingEntry,
  shouldSkipRelativePath,
} from './workspace-scan-filters'

const log = createLogger('toolSet:grep_files')

async function nodeGrepSingleFile(
  filePath: string,
  displayRoot: string,
  pattern: string,
  include?: string,
): Promise<Array<{ path: string; lineNumber: number; line: string; mtime: number }>> {
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch (err) {
    throw new Error(`Invalid regex pattern: ${String(err)}`)
  }

  const rel = path.relative(displayRoot, filePath) || path.basename(filePath)
  if (include) {
    const includeGlob = include.replace(/\*/g, '.*')
    const includeRegex = new RegExp(`^${includeGlob}$`)
    if (!includeRegex.test(rel) && !includeRegex.test(path.basename(filePath))) {
      return []
    }
  }

  const matches: Array<{ path: string; lineNumber: number; line: string; mtime: number }> = []
  try {
    const stats = await fs.stat(filePath)
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= MAX_GREP_MATCHES) break
      if (regex.test(lines[i])) {
        matches.push({
          path: rel,
          lineNumber: i + 1,
          line: truncateLine(lines[i]),
          mtime: stats.mtimeMs,
        })
      }
    }
  } catch {
    // unreadable file
  }
  return matches
}

async function nodeGrepFallback(
  root: string,
  pattern: string,
  include: string | undefined,
  includePackageFiles: boolean,
): Promise<Array<{ path: string; lineNumber: number; line: string; mtime: number }>> {
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch (err) {
    throw new Error(`Invalid regex pattern: ${String(err)}`)
  }

  const includeGlob = include?.replace(/\*/g, '.*') ?? '.*'
  const includeRegex = new RegExp(`^${includeGlob}$`)

  const matches: Array<{ path: string; lineNumber: number; line: string; mtime: number }> = []

  async function scan(dir: string): Promise<void> {
    if (matches.length >= MAX_GREP_MATCHES) return

    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (matches.length >= MAX_GREP_MATCHES) return
      const entryPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (
          shouldSkipListingEntry(
            entry.name,
            true,
            includePackageFiles,
          )
        ) {
          continue
        }
        await scan(entryPath)
        continue
      }

      if (!entry.isFile()) continue
      if (
        shouldSkipListingEntry(entry.name, false, includePackageFiles)
      ) {
        continue
      }
      const rel = path.relative(root, entryPath)
      if (!includeRegex.test(rel) && !includeRegex.test(entry.name)) continue

      try {
        const stats = await fs.stat(entryPath)
        const content = await fs.readFile(entryPath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= MAX_GREP_MATCHES) return
          if (regex.test(lines[i])) {
            matches.push({
              path: rel,
              lineNumber: i + 1,
              line: truncateLine(lines[i]),
              mtime: stats.mtimeMs,
            })
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  await scan(root)
  log.info('Node grep fallback scan completed', {
    root,
    pattern,
    include: include ?? null,
    matchCount: matches.length,
  })
  return matches
}

export const grepFiles: SkillTool = {
  name: 'grep_files',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Search file contents with a regex in the user project. ${WORKSPACE_PATH_HINT}${SANDBOX_ARTIFACT_HINT} By default skips node_modules, Python package dirs, and hidden paths. Returns up to 100 matches sorted by modification time (newest first).`,
  inputSchema: z.object({
    pattern: z.string().min(1),
    path: z
      .string()
      .min(1)
      .optional()
      .describe('Directory or single file to search (default: workspace root).'),
    include: z.string().optional(),
    include_package_files: includePackageFilesField,
  }),
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const pattern = input['pattern']
    const searchPath = (input['path'] as string | undefined) ?? '.'
    const include = input['include'] as string | undefined
    const includePackageFiles = parseIncludePackageFiles(input)

    if (typeof pattern !== 'string' || pattern.trim() === '') {
      return { error: 'Invalid pattern: expected a non-empty regex string.' }
    }

    let resolvedPath: string
    try {
      resolvedPath = resolvePathInContext(sandbox.root, workspacePath, searchPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    try {
      const stat = await fs.stat(resolvedPath)
      const searchFile = stat.isFile()
      const searchRoot = searchFile ? path.dirname(resolvedPath) : resolvedPath
      const displayRoot = searchFile ? searchRoot : resolvedPath

      const rgArgs = [
        '--no-heading',
        pattern,
        ...ripgrepExcludeGlobArgs(includePackageFiles),
      ]
      if (include) {
        rgArgs.push('-g', include)
      }
      if (searchFile) {
        rgArgs.push(resolvedPath)
      }

      log.info('grep_files started', {
        sandboxRoot: sandbox.root,
        searchPath: resolvedPath,
        searchFile,
        pattern,
        include: include ?? null,
        engine: 'ripgrep',
      })

      const rgResult = await runRipgrepJson(rgArgs, searchRoot)
      let matches = rgResult.matches.filter(
        (m) => !shouldSkipRelativePath(m.path, includePackageFiles),
      )
      let usedFallback = false
      let engine: 'ripgrep' | 'node-fallback' = 'ripgrep'

      if (!rgResult.available) {
        log.warn('grep_files switching to Node fallback', {
          searchPath: resolvedPath,
          pattern,
          include: include ?? null,
          ripgrepError: rgResult.error ?? 'unknown',
        })
        const fallback = searchFile
          ? await nodeGrepSingleFile(resolvedPath, displayRoot, pattern, include)
          : await nodeGrepFallback(
              resolvedPath,
              pattern,
              include,
              includePackageFiles,
            )
        usedFallback = true
        engine = 'node-fallback'
        matches = fallback.map((m) => ({
          path: m.path,
          lineNumber: m.lineNumber,
          line: m.line,
        }))
      } else if (matches.length > 0) {
        const withMtime = await Promise.all(
          matches.map(async (m) => {
            const abs = path.isAbsolute(m.path)
              ? m.path
              : path.join(searchRoot, m.path)
            try {
              const stats = await fs.stat(abs)
              return { ...m, mtime: stats.mtimeMs }
            } catch {
              return { ...m, mtime: 0 }
            }
          }),
        )
        withMtime.sort((a, b) => b.mtime - a.mtime)
        matches = withMtime
      }

      const truncated = matches.length > MAX_GREP_MATCHES
      const limited = matches.slice(0, MAX_GREP_MATCHES)

      const lines = limited.map((m) => {
        const rel = matchPathToDisplayPath(
          m.path,
          displayRoot,
          sandbox.root,
          workspacePath,
        )
        return `${rel}:${m.lineNumber}: ${truncateLine(m.line, MAX_LINE_CHARS)}`
      })

      const result: Record<string, unknown> = {
        path: toToolAbsolutePath(resolvedPath),
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        pattern,
        matchCount: limited.length,
        matches: lines.join('\n'),
      }

      if (truncated) {
        result.note = `Results truncated at ${MAX_GREP_MATCHES} matches.`
      }
      if (usedFallback) {
        result.note = [result.note, 'Used Node fallback (ripgrep unavailable).']
          .filter(Boolean)
          .join(' ')
      }

      log.info('grep_files completed', {
        searchPath: resolvedPath,
        pattern,
        engine,
        matchCount: limited.length,
        truncated,
        usedFallback,
      })

      return result
    } catch (error) {
      log.warn('grep_files failed', {
        searchPath: resolvedPath,
        pattern,
        error: String(error),
      })
      return { error: String(error) }
    }
  },
}
