import { join } from 'node:path'
import type { SandboxContext } from '../sandbox/context'

export function uniqueStrings(paths: string[]): string[] {
  return [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
}

/** Sandbox dirs where artifacts typically land (for path hints on exports). */
export function collectSandboxArtifactPaths(
  sandbox?: SandboxContext,
): string[] {
  const layout = sandbox?.layout
  if (!layout) return []
  return uniqueStrings([
    layout.root,
    layout.outputDir,
    join(layout.root, 'output', 'results'),
    join(layout.root, 'output', 'toolLoop'),
    layout.refsDir,
    layout.scriptsDir,
  ])
}
