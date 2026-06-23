/** POSIX-style basename (safe in browser and Node). */
function pathBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * True for run_script stdout/stderr capture logs (e.g. `capture-1730123456-abcd.txt`).
 * These are internal scratch files, not user-facing deliverables.
 */
export function isCaptureArtifactPath(filePath: string): boolean {
  const base = pathBasename(filePath.trim()).toLowerCase()
  if (!base) return false
  return base.startsWith('capture') && base.endsWith('.txt')
}
