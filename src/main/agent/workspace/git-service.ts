/**
 * Thin wrapper around the git CLI.
 *
 * Shared by agent git tools (toolSet/git.ts) and IPC handlers (UI panel).
 */
import { execFile } from 'child_process'
import fg from 'fast-glob'
import { readFile, readdir, stat, writeFile } from 'fs/promises'
import { join, relative, resolve } from 'path'
import { promisify } from 'util'
import { isLikelyBinary } from '@toolSet/file-system/format-tool-output'
import { withFileLock } from '@toolSet/file-system/file-io-utils'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 30_000
const GIT_MAX_BUFFER = 10 * 1024 * 1024 // 10 MB

/** Strip ANSI color sequences from git CLI output when color.ui is enabled. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

export type GitResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; error: string; stdout: string }

export type GitDiffResult =
  | { ok: true; diff: string }
  | { ok: false; error: string }

export type GitStatusEntry = {
  /** Two-character status code from `git status --short` (e.g. ' M', 'A ', '??'). */
  code: string
  /** X column (index/staging area). */
  index: string
  /** Y column (working tree). */
  worktree: string
  path: string
  /** Original path before rename, if applicable. */
  origPath?: string
}

export type GitStatusResult = {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  entries: GitStatusEntry[]
  clean: boolean
}

export type GitLogEntry = {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  refs: string
}

/** Agent-friendly buckets derived from {@link GitStatusResult}. */
export function gitStatusToToolShape(status: GitStatusResult): {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  modified: string[]
  staged: string[]
  untracked: string[]
  clean: boolean
} {
  const modified: string[] = []
  const staged: string[] = []
  const untracked: string[] = []

  for (const entry of status.entries) {
    const { index, worktree, path } = entry
    if (index === '?' && worktree === '?') {
      untracked.push(path)
      continue
    }
    if (index !== ' ') staged.push(path)
    if (worktree !== ' ') modified.push(path)
  }

  return {
    branch: status.branch,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    modified,
    staged,
    untracked,
    clean: status.clean,
  }
}

// ─── Core runner ──────────────────────────────────────────────────────────────

export async function runGit(
  cwd: string,
  args: string[],
  timeoutMs = GIT_TIMEOUT_MS,
): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'git',
      ['-c', 'color.ui=false', ...args],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: GIT_MAX_BUFFER,
      },
    )
    return {
      ok: true,
      stdout: stripAnsi(stdout.trimEnd()),
      stderr: stripAnsi(stderr.trimEnd()),
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      error: e.stderr?.trim() || e.message || String(err),
      stdout: e.stdout?.trim() || '',
    }
  }
}

// ─── git status ───────────────────────────────────────────────────────────────

export async function gitStatus(cwd: string): Promise<GitStatusResult> {
  const result = await runGit(cwd, ['status', '--short', '--branch', '-u'])
  if (!result.ok) {
    return {
      branch: '',
      upstream: null,
      ahead: 0,
      behind: 0,
      entries: [],
      clean: false,
    }
  }

  const lines = result.stdout.split('\n')
  let branch = ''
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const entries: GitStatusEntry[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const branchLine = line.slice(3)
      const noCommits = branchLine.startsWith('No commits yet on ')
      if (noCommits) {
        branch = branchLine.slice('No commits yet on '.length).trim()
      } else {
        const [branchPart, ...rest] = branchLine.split('...')
        branch = branchPart ?? ''
        const trackingPart = rest.join('...')
        if (trackingPart) {
          const upstreamMatch = trackingPart.match(/^([^\s[]+)/)
          upstream = upstreamMatch?.[1] ?? null
          const aheadMatch = trackingPart.match(/ahead (\d+)/)
          const behindMatch = trackingPart.match(/behind (\d+)/)
          ahead = aheadMatch ? parseInt(aheadMatch[1]!, 10) : 0
          behind = behindMatch ? parseInt(behindMatch[1]!, 10) : 0
        }
      }
      continue
    }

    if (line.length < 3) continue
    const index = line[0] ?? ' '
    const worktree = line[1] ?? ' '
    const code = `${index}${worktree}`
    const rest = line.slice(3)

    if (rest.includes(' -> ')) {
      const [origPath, path] = rest.split(' -> ')
      entries.push({
        code,
        index,
        worktree,
        path: path ?? rest,
        origPath: origPath ?? undefined,
      })
    } else {
      entries.push({ code, index, worktree, path: rest })
    }
  }

  return {
    branch,
    upstream,
    ahead,
    behind,
    entries,
    clean: entries.length === 0,
  }
}

// ─── git diff ─────────────────────────────────────────────────────────────────

const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null'

/** `git diff --no-index` exits 1 when files differ; stdout still contains the diff. */
async function gitDiffUntrackedFile(
  cwd: string,
  relativePath: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-c', 'color.ui=false', 'diff', '--no-index', NULL_DEVICE, relativePath],
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      },
    )
    return stripAnsi(stdout.trimEnd())
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string }
    if (e.code === 1 && e.stdout) {
      return stripAnsi(String(e.stdout).trimEnd())
    }
    return ''
  }
}

export async function gitDiff(
  cwd: string,
  options: { staged?: boolean; files?: string[] } = {},
): Promise<GitDiffResult> {
  const requested = options.files?.map((f) => f.trim()).filter(Boolean)

  if (options.staged) {
    const args = ['diff', '--cached']
    if (requested?.length) {
      args.push('--', ...requested)
    }
    const result = await runGit(cwd, args)
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, diff: result.stdout }
  }

  const status = await gitStatus(cwd)
  const untracked = new Set(
    status.entries.filter((e) => e.code === '??').map((e) => e.path),
  )

  const trackedFiles = requested
    ? requested.filter((f) => !untracked.has(f))
    : undefined
  const untrackedFiles = requested
    ? requested.filter((f) => untracked.has(f))
    : [...untracked]

  const parts: string[] = []

  if (!requested || trackedFiles.length > 0) {
    const args = ['diff']
    if (trackedFiles?.length) {
      args.push('--', ...trackedFiles)
    }
    const result = await runGit(cwd, args)
    if (!result.ok) return { ok: false, error: result.error }
    if (result.stdout) parts.push(result.stdout)
  }

  for (const file of untrackedFiles) {
    const chunk = await gitDiffUntrackedFile(cwd, file)
    if (chunk) parts.push(chunk)
  }

  return { ok: true, diff: parts.join('\n') }
}

// ─── git log ──────────────────────────────────────────────────────────────────

export async function gitLog(cwd: string, limit = 20): Promise<GitLogEntry[]> {
  const sep = '\x1f'
  const fmt = `%H${sep}%h${sep}%s${sep}%an${sep}%ci${sep}%D`
  const result = await runGit(cwd, ['log', `--format=${fmt}`, `-${limit}`])
  if (!result.ok || !result.stdout) return []

  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, author, date, refs] = line.split(sep)
      return {
        hash: hash ?? '',
        shortHash: shortHash ?? '',
        subject: subject ?? '',
        author: author ?? '',
        date: date ?? '',
        refs: refs ?? '',
      }
    })
}

// ─── git add ──────────────────────────────────────────────────────────────────

export async function gitAdd(cwd: string, files: string[]): Promise<GitResult> {
  if (files.length === 0) return runGit(cwd, ['add', '-A'])
  return runGit(cwd, ['add', '--', ...files])
}

// ─── git commit ───────────────────────────────────────────────────────────────

export async function gitCommit(
  cwd: string,
  message: string,
): Promise<GitResult> {
  return runGit(cwd, ['commit', '-m', message])
}

// ─── git push ─────────────────────────────────────────────────────────────────

export async function gitPush(
  cwd: string,
  options: { remote?: string; branch?: string; setUpstream?: boolean } = {},
): Promise<GitResult> {
  const args = ['push']
  if (options.setUpstream && options.remote && options.branch) {
    args.push('--set-upstream', options.remote, options.branch)
  } else if (options.remote) {
    args.push(options.remote)
    if (options.branch) args.push(options.branch)
  }
  return runGit(cwd, args)
}

// ─── gh pr create ─────────────────────────────────────────────────────────────

export async function ghCreatePr(
  cwd: string,
  options: { title: string; body: string; base?: string; draft?: boolean },
): Promise<{ ok: boolean; url: string; error?: string }> {
  const args = [
    'pr',
    'create',
    '--title',
    options.title,
    '--body',
    options.body,
  ]
  if (options.base) args.push('--base', options.base)
  if (options.draft) args.push('--draft')

  try {
    const { stdout, stderr } = await execFileAsync('gh', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
    })
    const url =
      stdout
        .trim()
        .split('\n')
        .reverse()
        .find((l) => l.startsWith('http')) ?? stdout.trim()
    return { ok: true, url, error: stderr.trim() || undefined }
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string }
    return {
      ok: false,
      url: '',
      error: e.stderr?.trim() || e.message || String(err),
    }
  }
}

// ─── list workspace files ─────────────────────────────────────────────────────

export type WorkspaceFileEntry = {
  path: string
  name: string
  isDir: boolean
  gitStatus?: string
}

function gitStatusForEntry(
  entryPath: string,
  statusMap: Map<string, string>,
): string | undefined {
  const direct = statusMap.get(entryPath)
  if (direct) return direct

  const prefix = `${entryPath}/`
  for (const [p, code] of statusMap) {
    if (p.startsWith(prefix)) return code.trim() || '?'
  }
  return undefined
}

export type ListWorkspaceFilesResult =
  | { ok: true; entries: WorkspaceFileEntry[] }
  | { ok: false; error: string }

function normalizeRelativePath(p: string): string {
  const n = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  return n || '.'
}

/**
 * Lists immediate children under `relativePath` via the filesystem, with git
 * status badges when the folder is a git repository.
 */
export async function listWorkspaceFiles(
  cwd: string,
  relativePath = '.',
): Promise<ListWorkspaceFilesResult> {
  const normalizedRel = normalizeRelativePath(relativePath)
  const dirAbs =
    normalizedRel === '.' ? resolve(cwd) : resolve(cwd, normalizedRel)

  let dirents
  try {
    dirents = await readdir(dirAbs, { withFileTypes: true })
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  const statusResult = await gitStatus(cwd)
  const statusMap = new Map<string, string>()
  for (const entry of statusResult.entries) {
    statusMap.set(entry.path.replace(/\\/g, '/'), entry.code.trim() || '?')
  }

  const basePrefix =
    normalizedRel === '.' ? '' : `${normalizedRel.replace(/\/+$/, '')}/`

  const entries: WorkspaceFileEntry[] = []
  for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
    if (dirent.name === '.git') continue
    const relPath = basePrefix ? `${basePrefix}${dirent.name}` : dirent.name
    entries.push({
      path: relPath,
      name: dirent.name,
      isDir: dirent.isDirectory(),
      gitStatus: gitStatusForEntry(relPath, statusMap),
    })
  }

  return { ok: true, entries }
}

/** Resolve a workspace-relative path and ensure it stays inside `cwd`. */
export function resolvePathInsideWorkspace(
  cwd: string,
  relativePath: string,
): { ok: true; absolutePath: string } | { ok: false; error: string } {
  const trimmed = relativePath.trim()
  if (!trimmed) {
    return { ok: false, error: 'relativePath is required.' }
  }

  const absCwd = resolve(cwd)
  const absTarget = resolve(absCwd, trimmed)
  const rel = relative(absCwd, absTarget)
  if (rel.startsWith('..') || rel === '..') {
    return { ok: false, error: 'Path escapes the workspace folder.' }
  }

  return { ok: true, absolutePath: absTarget }
}

// ─── search workspace files (composer @ mentions) ────────────────────────────

const WORKSPACE_SEARCH_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.electron-vite/**',
]

export type SearchWorkspaceFilesResult =
  | { ok: true; paths: string[] }
  | { ok: false; error: string }

/**
 * Fuzzy file search under a workspace root for `@file` composer mentions.
 */
export async function searchWorkspaceFiles(
  cwd: string,
  query: string,
  opts: { limit?: number } = {},
): Promise<SearchWorkspaceFilesResult> {
  const limit = opts.limit ?? 25
  const absCwd = resolve(cwd)
  const q = query.trim().toLowerCase()

  try {
    const all = await fg(['**/*'], {
      cwd: absCwd,
      ignore: WORKSPACE_SEARCH_IGNORE,
      onlyFiles: true,
      dot: false,
      deep: 10,
    })

    const ranked = all
      .map((path) => {
        const normalized = path.replace(/\\/g, '/')
        const base = normalized.split('/').pop() ?? normalized
        const baseLower = base.toLowerCase()
        const pathLower = normalized.toLowerCase()
        let score = 0
        if (!q) score = 1
        else if (baseLower === q) score = 0
        else if (baseLower.startsWith(q)) score = 1
        else if (pathLower.includes(q)) score = 2
        else return null
        return { path: normalized, score, len: normalized.length }
      })
      .filter(
        (row): row is { path: string; score: number; len: number } =>
          row != null,
      )
      .sort(
        (a, b) =>
          a.score - b.score || a.len - b.len || a.path.localeCompare(b.path),
      )

    return { ok: true, paths: ranked.slice(0, limit).map((r) => r.path) }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ─── workspace file editor (read / write) ─────────────────────────────────────

export const MAX_WORKSPACE_EDITOR_BYTES = 2 * 1024 * 1024

export type ReadWorkspaceFileContentResult =
  | { ok: true; content: string; size: number }
  | { ok: false; error: string; binary?: boolean }

export type WriteWorkspaceFileContentResult =
  | { ok: true }
  | { ok: false; error: string }

export type RunWorkspaceTerminalCommandResult =
  | { ok: true; cwd: string; stdout: string; stderr: string; exitCode: number }
  | {
      ok: false
      error: string
      cwd?: string
      stdout?: string
      stderr?: string
      exitCode?: number
    }

export async function readWorkspaceFileContent(
  cwd: string,
  relativePath: string,
): Promise<ReadWorkspaceFileContentResult> {
  const resolved = resolvePathInsideWorkspace(cwd, relativePath)
  if (!resolved.ok) return resolved

  try {
    const fileStat = await stat(resolved.absolutePath)
    if (!fileStat.isFile()) {
      return { ok: false, error: 'Path is not a file.' }
    }
    if (fileStat.size > MAX_WORKSPACE_EDITOR_BYTES) {
      return {
        ok: false,
        error: `File is too large to edit (${fileStat.size} bytes). Max ${MAX_WORKSPACE_EDITOR_BYTES} bytes.`,
      }
    }

    const buffer = await readFile(resolved.absolutePath)
    if (isLikelyBinary(buffer)) {
      return {
        ok: false,
        error: 'Binary file cannot be edited as text.',
        binary: true,
      }
    }

    return {
      ok: true,
      content: buffer.toString('utf-8'),
      size: fileStat.size,
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { ok: false, error: 'File not found.' }
    }
    return { ok: false, error: String(err) }
  }
}

export async function writeWorkspaceFileContent(
  cwd: string,
  relativePath: string,
  content: string,
): Promise<WriteWorkspaceFileContentResult> {
  const resolved = resolvePathInsideWorkspace(cwd, relativePath)
  if (!resolved.ok) return resolved

  try {
    const fileStat = await stat(resolved.absolutePath)
    if (!fileStat.isFile()) {
      return { ok: false, error: 'Path is not a file.' }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { ok: false, error: 'File not found.' }
    }
    return { ok: false, error: String(err) }
  }

  try {
    await withFileLock(resolved.absolutePath, async () => {
      await writeFile(resolved.absolutePath, content, 'utf-8')
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

const WORKSPACE_TERMINAL_TIMEOUT_MS = 60_000
const WORKSPACE_TERMINAL_MAX_BUFFER = 10 * 1024 * 1024

/**
 * Executes a shell command inside the workspace (or one of its subdirectories).
 */
export async function runWorkspaceTerminalCommand(
  cwd: string,
  command: string,
  relativeCwd = '.',
): Promise<RunWorkspaceTerminalCommandResult> {
  const trimmedCommand = command.trim()
  if (!trimmedCommand) {
    return { ok: false, error: 'Command must not be empty.' }
  }

  const resolvedCwd = resolvePathInsideWorkspace(cwd, relativeCwd)
  if (!resolvedCwd.ok) return resolvedCwd

  const shellPath =
    process.env.SHELL?.trim() ||
    (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash')
  const shellArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', trimmedCommand]
      : ['-lc', trimmedCommand]

  try {
    const { stdout, stderr } = await execFileAsync(shellPath, shellArgs, {
      cwd: resolvedCwd.absolutePath,
      timeout: WORKSPACE_TERMINAL_TIMEOUT_MS,
      maxBuffer: WORKSPACE_TERMINAL_MAX_BUFFER,
    })
    return {
      ok: true,
      cwd: resolvedCwd.absolutePath,
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      exitCode: 0,
    }
  } catch (err) {
    const e = err as {
      code?: number | string
      signal?: string
      message?: string
      stdout?: string
      stderr?: string
    }
    const numericExitCode =
      typeof e.code === 'number'
        ? e.code
        : Number.isFinite(Number(e.code))
          ? Number(e.code)
          : 1
    return {
      ok: false,
      error: e.stderr?.trim() || e.message || 'Command failed.',
      cwd: resolvedCwd.absolutePath,
      stdout: e.stdout?.trimEnd() || '',
      stderr: e.stderr?.trimEnd() || '',
      exitCode: numericExitCode,
    }
  }
}
