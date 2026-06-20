import { promises as fs } from 'fs'
import path from 'path'
import { createTwoFilesPatch, diffLines } from 'diff'
import type { FileChangeAction, FileChangePreview } from '@shared/file-change/types'

export async function movePath(
  sourcePath: string,
  destPath: string,
  overwrite: boolean,
): Promise<void> {
  if (!overwrite) {
    try {
      await fs.access(destPath)
      throw new Error(`Destination already exists: ${destPath}`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
  }

  await fs.mkdir(path.dirname(destPath), { recursive: true })

  try {
    await fs.rename(sourcePath, destPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EXDEV' || code === 'EPERM') {
      await fs.copyFile(sourcePath, destPath)
      await fs.unlink(sourcePath)
      return
    }
    throw err
  }
}

export function normalizeLineEndings(text: string): string {
  return text.replaceAll('\r\n', '\n')
}

export function detectLineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

export function convertToLineEnding(text: string, ending: '\n' | '\r\n'): string {
  if (ending === '\n') return text
  return text.replaceAll('\n', '\r\n')
}

const fileLocks = new Map<string, Promise<void>>()

export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const resolved = path.resolve(filePath)
  const previous = fileLocks.get(resolved) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  fileLocks.set(resolved, previous.then(() => gate))

  await previous
  try {
    return await fn()
  } finally {
    release()
    if (fileLocks.get(resolved) === gate) {
      fileLocks.delete(resolved)
    }
  }
}

export function trimDiff(diff: string): string {
  const lines = diff.split('\n')
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) &&
      !line.startsWith('---') &&
      !line.startsWith('+++'),
  )

  if (contentLines.length === 0) return diff

  let min = Infinity
  for (const line of contentLines) {
    const content = line.slice(1)
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/)
      if (match) min = Math.min(min, match[1].length)
    }
  }
  if (min === Infinity || min === 0) return diff

  const trimmedLines = lines.map((line) => {
    if (
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) &&
      !line.startsWith('---') &&
      !line.startsWith('+++')
    ) {
      const prefix = line[0]
      const content = line.slice(1)
      return prefix + content.slice(min)
    }
    return line
  })

  return trimmedLines.join('\n')
}

export interface DiffMetadata {
  diff: string
  additions: number
  deletions: number
}

export function createDiffMetadata(
  filePath: string,
  contentOld: string,
  contentNew: string,
): DiffMetadata {
  const diff = trimDiff(
    createTwoFilesPatch(
      filePath,
      filePath,
      normalizeLineEndings(contentOld),
      normalizeLineEndings(contentNew),
    ),
  )

  let additions = 0
  let deletions = 0
  for (const change of diffLines(contentOld, contentNew)) {
    if (change.added) additions += change.count ?? 0
    if (change.removed) deletions += change.count ?? 0
  }

  return { diff, additions, deletions }
}

/**
 * Stable absolute path for tool list/read/grep output so paths round-trip when
 * passed back into read_file or list_files.
 */
export function toToolAbsolutePath(absolutePath: string): string {
  return path.resolve(absolutePath)
}

/**
 * Compute a short, human-readable display path for a file that may live either
 * inside the sandbox or inside the user's workspace folder.
 *
 * Priority: workspace root (when the file is inside it) → sandbox root → basename fallback.
 * Prefer {@link toToolAbsolutePath} for list/grep/read tool output.
 */
export function toToolDisplayPath(
  absolutePath: string,
  sandboxRoot: string,
  workspacePath: string | null | undefined,
): string {
  if (workspacePath) {
    const rel = path.relative(path.resolve(workspacePath), path.resolve(absolutePath))
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.split(path.sep).join('/')
    }
  }
  const rel = path.relative(path.resolve(sandboxRoot), path.resolve(absolutePath))
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join('/')
  }
  return path.basename(absolutePath)
}

/** Resolve a search/grep match path to a stable absolute path for tool output. */
export function matchPathToDisplayPath(
  matchPath: string,
  searchRoot: string,
  _sandboxRoot: string,
  _workspacePath: string | null | undefined,
): string {
  const abs = path.isAbsolute(matchPath)
    ? path.normalize(matchPath)
    : path.normalize(path.join(searchRoot, matchPath))
  return toToolAbsolutePath(abs)
}

function computeDisplayPath(
  absolutePath: string,
  sandboxRoot: string,
  workspacePath: string | null | undefined,
): string {
  return toToolDisplayPath(absolutePath, sandboxRoot, workspacePath)
}

export function buildFileChangePreview(
  sandboxRoot: string,
  absolutePath: string,
  contentOld: string,
  contentNew: string,
  extras?: {
    action?: FileChangeAction
    moveFrom?: string
    /** When set, paths inside the workspace are shown relative to it. */
    workspacePath?: string | null
  },
): FileChangePreview {
  const workspacePath = extras?.workspacePath ?? null
  const displayPath = computeDisplayPath(absolutePath, sandboxRoot, workspacePath)
  const meta = createDiffMetadata(displayPath, contentOld, contentNew)
  return {
    path: computeDisplayPath(absolutePath, sandboxRoot, workspacePath),
    diff: meta.diff,
    additions: meta.additions,
    deletions: meta.deletions,
    action: extras?.action,
    moveFrom: extras?.moveFrom
      ? computeDisplayPath(extras.moveFrom, sandboxRoot, workspacePath)
      : undefined,
    workspacePath: workspacePath ?? undefined,
  }
}

export async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw err
  }
}
