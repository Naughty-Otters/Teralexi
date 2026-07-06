import { promises as fs } from 'fs'
import path from 'path'
import type { FileSnapshotEntry } from './run-script-artifacts'
import { findChangedFiles } from './run-script-artifacts'

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

export async function snapshotWorkspaceGuard(
  workspaceRoot: string,
  maxDepth = 6,
): Promise<Map<string, FileSnapshotEntry>> {
  const map = new Map<string, FileSnapshotEntry>()
  const normalizedRoot = path.normalize(workspaceRoot)

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
        map.set(path.normalize(full), {
          mtimeMs: st.mtimeMs,
          size: st.size,
        })
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
  const changed = findChangedFiles(before, after)
  return changed.map((abs) => {
    const rel = path.relative(workspaceRoot, abs)
    return rel.split(path.sep).join('/')
  })
}

export const WORKSPACE_WRITE_WARNING =
  'Script created or modified files in the user workspace. Write generated outputs under TERALEXI_RESULTS_DIR, ./results/, or results/scratch/ in the sandbox step folder. Use promote_artifact to copy deliverables into the workspace when intentional.'
