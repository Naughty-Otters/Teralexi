import { promises as fs } from 'fs'
import path from 'path'
import type { FileChangePreview } from '@shared/file-change/types'
import { isLikelyBinaryFilePath } from '@shared/agent/non-binary-file'
import type { FileSnapshotEntry } from './run-script-artifacts'
import { findChangedFiles } from './run-script-artifacts'
import { buildFileChangePreview } from './file-system/file-io-utils'

/** Heavy or tool-managed dirs skipped when scanning the user workspace after scripts. */
export const WORKSPACE_SNAPSHOT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.teralexi',
  'storage',
])

/** Per-file cap when capturing text for post-hoc diffs. */
export const WORKSPACE_SNAPSHOT_CONTENT_MAX_BYTES = 512 * 1024

/** Total cap across all captured file bodies in one snapshot. */
export const WORKSPACE_SNAPSHOT_CONTENT_TOTAL_MAX_BYTES = 8 * 1024 * 1024

/** Max file-change cards emitted from one shell/script run. */
export const WORKSPACE_WRITE_DIFF_MAX_FILES = 40

export type SnapshotWorkspaceGuardOptions = {
  maxDepth?: number
  /** Capture utf-8 bodies for text files (needed for modify/delete diffs). */
  captureTextContent?: boolean
}

export async function snapshotWorkspaceGuard(
  workspaceRoot: string,
  maxDepthOrOptions: number | SnapshotWorkspaceGuardOptions = 6,
): Promise<Map<string, FileSnapshotEntry>> {
  const options: SnapshotWorkspaceGuardOptions =
    typeof maxDepthOrOptions === 'number'
      ? { maxDepth: maxDepthOrOptions }
      : maxDepthOrOptions
  const maxDepth = options.maxDepth ?? 6
  const captureTextContent = options.captureTextContent === true

  const map = new Map<string, FileSnapshotEntry>()
  const normalizedRoot = path.normalize(workspaceRoot)
  let capturedBytes = 0

  async function walk(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue
      const full = path.join(current, ent.name)
      if (ent.isDirectory()) {
        if (WORKSPACE_SNAPSHOT_SKIP_DIRS.has(ent.name)) continue
        await walk(full, depth + 1)
        continue
      }
      if (!ent.isFile()) continue
      try {
        const st = await fs.stat(full)
        const entry: FileSnapshotEntry = {
          mtimeMs: st.mtimeMs,
          size: st.size,
        }
        if (
          captureTextContent &&
          st.size > 0 &&
          st.size <= WORKSPACE_SNAPSHOT_CONTENT_MAX_BYTES &&
          capturedBytes + st.size <= WORKSPACE_SNAPSHOT_CONTENT_TOTAL_MAX_BYTES &&
          !isLikelyBinaryFilePath(full)
        ) {
          try {
            const content = await fs.readFile(full, 'utf8')
            // Reject obvious binary that slipped past extension checks.
            if (!content.includes('\u0000')) {
              entry.content = content
              capturedBytes += st.size
            }
          } catch {
            // skip content; keep mtime/size
          }
        }
        map.set(path.normalize(full), entry)
      } catch {
        // skip
      }
    }
  }

  await walk(normalizedRoot, 0)
  return map
}

export function detectWorkspaceWrites(options: {
  workspaceRoot: string
  before: Map<string, FileSnapshotEntry>
  after: Map<string, FileSnapshotEntry>
}): string[] {
  const { workspaceRoot, before, after } = options
  const changedAbs = findChangedFiles(before, after)
  const deletedAbs: string[] = []
  for (const abs of before.keys()) {
    if (!after.has(abs)) deletedAbs.push(abs)
  }
  return [...changedAbs, ...deletedAbs].map((abs) => {
    const rel = path.relative(workspaceRoot, abs)
    return rel.split(path.sep).join('/')
  })
}

/**
 * Build chat file-change previews for workspace paths mutated by shell/scripts.
 * Uses before-snapshot content when available; creates use empty old content.
 */
export async function buildWorkspaceWriteFileChanges(options: {
  workspaceRoot: string
  before: Map<string, FileSnapshotEntry>
  after: Map<string, FileSnapshotEntry>
  relativeWrites: string[]
}): Promise<FileChangePreview[]> {
  const { workspaceRoot, before, after, relativeWrites } = options
  const out: FileChangePreview[] = []

  for (const rel of relativeWrites) {
    if (out.length >= WORKSPACE_WRITE_DIFF_MAX_FILES) break
    const trimmed = rel.trim()
    if (!trimmed || trimmed.startsWith('..')) continue
    if (isLikelyBinaryFilePath(trimmed)) continue

    const abs = path.normalize(path.join(workspaceRoot, trimmed))
    const beforeEntry = before.get(abs)
    const afterEntry = after.get(abs)
    const existedBefore = Boolean(beforeEntry)
    const existsAfter = Boolean(afterEntry)

    let action: FileChangePreview['action']
    let contentOld = ''
    let contentNew = ''

    if (!existedBefore && existsAfter) {
      action = 'create'
      contentOld = ''
      try {
        if (
          (afterEntry?.size ?? 0) > WORKSPACE_SNAPSHOT_CONTENT_MAX_BYTES
        ) {
          continue
        }
        contentNew = await fs.readFile(abs, 'utf8')
        if (contentNew.includes('\u0000')) continue
      } catch {
        continue
      }
    } else if (existedBefore && !existsAfter) {
      action = 'delete'
      contentOld = beforeEntry?.content ?? ''
      contentNew = ''
      if (!contentOld) continue
    } else if (existedBefore && existsAfter) {
      action = 'modify'
      contentOld = beforeEntry?.content ?? ''
      if (!contentOld) continue
      try {
        if (
          (afterEntry?.size ?? 0) > WORKSPACE_SNAPSHOT_CONTENT_MAX_BYTES
        ) {
          continue
        }
        contentNew = await fs.readFile(abs, 'utf8')
        if (contentNew.includes('\u0000')) continue
      } catch {
        continue
      }
    } else {
      continue
    }

    if (contentOld === contentNew) continue

    out.push(
      buildFileChangePreview(workspaceRoot, abs, contentOld, contentNew, {
        action,
        workspacePath: workspaceRoot,
      }),
    )
  }

  return out
}

export const WORKSPACE_WRITE_WARNING =
  'Script created or modified files in the user workspace. Prefer `edit_files` for intentional source edits (chat diffs). Write generated outputs under TERALEXI_RESULTS_DIR, ./results/, or results/scratch/ in the sandbox step folder; use promote_artifact to copy deliverables into the workspace when intentional.'

export const SHELL_WORKSPACE_WRITE_HINT =
  'Workspace files changed. Prefer `edit_files` for project source edits so the chat shows planned diffs; use `shell` for tests, git, rg/find, and builds.'
