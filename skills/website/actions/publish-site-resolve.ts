/**
 * Locate a finished static site (root index.html) for publish_website / toolbar.
 *
 * Prefer a workspace copy (promoted site) when present; otherwise use the newest
 * sandbox `output/results/<slug>` from render_website.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function hasIndexAt(dir: string): boolean {
  return (
    existsSync(join(dir, 'index.html')) || existsSync(join(dir, 'index.htm'))
  )
}

function collectSiteDirsUnder(root: string): Array<{ path: string; mtime: number }> {
  const dirs: Array<{ path: string; mtime: number }> = []
  if (!root.trim() || !existsSync(root) || !statSync(root).isDirectory()) {
    return dirs
  }

  if (hasIndexAt(root)) {
    dirs.push({ path: root, mtime: statSync(root).mtimeMs })
  }

  try {
    for (const name of readdirSync(root)) {
      if (name.startsWith('.')) continue
      const siteDir = join(root, name)
      try {
        if (!statSync(siteDir).isDirectory()) continue
        if (!hasIndexAt(siteDir)) continue
        dirs.push({ path: siteDir, mtime: statSync(siteDir).mtimeMs })
      } catch {
        /* skip unreadable entry */
      }
    }
  } catch {
    /* unreadable root */
  }

  return dirs
}

function rankSiteDirs(
  root: string,
  dirs: Array<{ path: string; mtime: number }>,
): string[] {
  const ranked = [...dirs]
  ranked.sort((a, b) => {
    const aIsRoot = a.path === root
    const bIsRoot = b.path === root
    if (aIsRoot !== bIsRoot) return aIsRoot ? 1 : -1
    return b.mtime - a.mtime
  })
  return ranked.map((d) => d.path)
}

export type PublishableSiteSearchRoots = {
  workspacePath?: string | null
  sandboxRoot?: string | null
}

/**
 * Ranked publishable site directories.
 * Workspace wins when it has a site; else sandbox `output/results`.
 */
export function findPublishableSiteDirs(
  roots: PublishableSiteSearchRoots,
): string[] {
  const workspace = roots.workspacePath?.trim() ?? ''
  if (workspace) {
    const fromWorkspace = rankSiteDirs(
      workspace,
      collectSiteDirsUnder(workspace),
    )
    if (fromWorkspace.length > 0) return fromWorkspace
  }

  const sandbox = roots.sandboxRoot?.trim() ?? ''
  if (!sandbox) return []
  const resultsRoot = join(sandbox, 'output', 'results')
  return rankSiteDirs(resultsRoot, collectSiteDirsUnder(resultsRoot))
}

export function latestPublishableSiteDir(
  roots: PublishableSiteSearchRoots,
): string | null {
  return findPublishableSiteDirs(roots)[0] ?? null
}
