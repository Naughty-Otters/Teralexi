import { promises as fs } from 'fs'
import path from 'path'

export type ScriptArtifactRole = 'primary' | 'capture' | 'script' | 'sidecar'

/** Whether a sandbox file is a step deliverable or scratch output. */
export type ArtifactDisposition = 'temp' | 'deliverable' | 'non_promotable'

export type ScriptArtifact = {
  role: ScriptArtifactRole
  disposition: ArtifactDisposition
  /** Absolute path on disk. */
  path: string
  /** Sandbox-relative path (POSIX slashes). */
  relPath: string
  sizeBytes?: number
}

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.csv',
  '.html',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.tex',
])

export type FileSnapshotEntry = { mtimeMs: number; size: number }

/** Top-level subdirs under a step folder that are tool-managed, not LLM deliverables. */
export const STEP_NON_DELIVERABLE_SUBDIRS = ['scripts'] as const

export async function snapshotFilesUnderDir(
  dir: string,
  maxDepth = 5,
): Promise<Map<string, FileSnapshotEntry>> {
  return snapshotFilesUnderDirWithExclusions(dir, { maxDepth })
}

/**
 * Snapshot files under a watch root for post-run artifact discovery.
 * Skips immediate child dirs listed in `excludeTopLevelDirs` (e.g. step `scripts/`).
 */
export async function snapshotDeliverableFiles(
  watchRoot: string,
  options?: {
    maxDepth?: number
    excludeTopLevelDirs?: readonly string[]
  },
): Promise<Map<string, FileSnapshotEntry>> {
  return snapshotFilesUnderDirWithExclusions(watchRoot, {
    maxDepth: options?.maxDepth ?? 5,
    excludeTopLevelDirs: options?.excludeTopLevelDirs ?? STEP_NON_DELIVERABLE_SUBDIRS,
  })
}

async function snapshotFilesUnderDirWithExclusions(
  dir: string,
  options: {
    maxDepth: number
    excludeTopLevelDirs?: readonly string[]
  },
): Promise<Map<string, FileSnapshotEntry>> {
  const map = new Map<string, FileSnapshotEntry>()
  const excludeTop = new Set(options.excludeTopLevelDirs ?? [])
  const normalizedRoot = path.normalize(dir)

  async function walk(current: string, depth: number): Promise<void> {
    if (depth > options.maxDepth) return
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
        if (depth === 0 && excludeTop.has(ent.name)) continue
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

/** Drop paths under excluded step subdirs (e.g. generated run_script sources). */
export function filterDeliverableChangedPaths(
  changedPaths: string[],
  watchRoot: string,
  excludeSubdirs: readonly string[] = STEP_NON_DELIVERABLE_SUBDIRS,
): string[] {
  const blockedRoots = excludeSubdirs.map((name) =>
    path.normalize(path.join(watchRoot, name)),
  )
  return changedPaths.filter((filePath) => {
    const norm = path.normalize(filePath)
    for (const blocked of blockedRoots) {
      if (norm === blocked) return false
      const rel = path.relative(blocked, norm)
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) return false
    }
    return true
  })
}

export function findChangedFiles(
  before: Map<string, FileSnapshotEntry>,
  after: Map<string, FileSnapshotEntry>,
): string[] {
  const changed: string[] = []
  for (const [filePath, meta] of after) {
    const prev = before.get(filePath)
    if (!prev || prev.mtimeMs !== meta.mtimeMs || prev.size !== meta.size) {
      changed.push(filePath)
    }
  }
  return changed
}

function toPosixRel(sandboxRoot: string, absPath: string): string {
  return path.relative(sandboxRoot, absPath).split(path.sep).join('/')
}

function isCaptureLike(filePath: string, captureAbs?: string): boolean {
  if (captureAbs && path.normalize(filePath) === path.normalize(captureAbs)) {
    return true
  }
  const base = path.basename(filePath).toLowerCase()
  return base.startsWith('capture-') && base.endsWith('.txt')
}

function sandboxRelativePosix(sandboxRoot: string, absPath: string): string {
  return path
    .relative(path.resolve(sandboxRoot), path.resolve(absPath))
    .split(path.sep)
    .join('/')
}

/**
 * Classify a sandbox file for promotion policy.
 * Temp scratch files stay in the step folder unless `allowTemp` is set on promote.
 */
export function classifySandboxArtifactPath(
  absPath: string,
  sandboxRoot: string,
): ArtifactDisposition {
  const rel = sandboxRelativePosix(sandboxRoot, absPath)
  const segments = rel.split('/').filter(Boolean)
  const base = path.basename(absPath).toLowerCase()

  if (segments.includes('scripts')) return 'non_promotable'
  if (segments[0] === 'skills' || segments[0] === 'refs') return 'non_promotable'
  if (isCaptureLike(absPath)) return 'temp'

  const resultsIdx = segments.indexOf('results')
  if (resultsIdx >= 0) {
    const afterResults = segments.slice(resultsIdx + 1)
    if (afterResults[0] === 'scratch' || afterResults[0] === 'tmp' || afterResults[0] === 'cache') {
      return 'temp'
    }
  }

  if (/\.(tmp|log)$/i.test(base)) return 'temp'

  return 'deliverable'
}

function dispositionForArtifact(options: {
  role: ScriptArtifactRole
  absPath: string
  sandboxRoot: string
  primaryAbs?: string | null
}): ArtifactDisposition {
  const { role, absPath, sandboxRoot, primaryAbs } = options
  if (role === 'script') return 'non_promotable'
  if (role === 'capture') return 'temp'
  if (role === 'primary') return 'deliverable'
  if (primaryAbs && path.normalize(absPath) === path.normalize(primaryAbs)) {
    return 'deliverable'
  }
  return classifySandboxArtifactPath(absPath, sandboxRoot)
}

function scorePrimaryCandidate(filePath: string): number {
  const ext = path.extname(filePath).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) return 100
  if (ext) return 10
  return 1
}

function pickPrimaryPath(options: {
  declaredPrimaryAbs?: string | null
  changedPaths: string[]
  captureAbs?: string
  scriptAbs?: string
}): string | null {
  const { declaredPrimaryAbs, changedPaths, captureAbs, scriptAbs } = options

  if (declaredPrimaryAbs) {
    try {
      return path.normalize(declaredPrimaryAbs)
    } catch {
      // fall through
    }
  }

  const candidates = changedPaths
    .map((p) => path.normalize(p))
    .filter((p) => !isCaptureLike(p, captureAbs))
    .filter((p) => !scriptAbs || p !== path.normalize(scriptAbs))

  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!

  const scored = [...candidates].sort((a, b) => {
    const scoreDiff = scorePrimaryCandidate(b) - scorePrimaryCandidate(a)
    if (scoreDiff !== 0) return scoreDiff
    return b.length - a.length
  })
  return scored[0] ?? null
}

export function buildScriptArtifacts(options: {
  sandboxRoot: string
  scriptPath: string
  captureAbsolutePath: string
  declaredPrimaryAbs?: string | null
  changedPaths: string[]
}): ScriptArtifact[] {
  const {
    sandboxRoot,
    scriptPath,
    captureAbsolutePath,
    declaredPrimaryAbs,
    changedPaths,
  } = options

  const primaryAbs = pickPrimaryPath({
    declaredPrimaryAbs,
    changedPaths,
    captureAbs: captureAbsolutePath,
    scriptAbs: scriptPath,
  })

  const artifacts: ScriptArtifact[] = []
  const seen = new Set<string>()

  const push = (artifact: ScriptArtifact) => {
    const key = artifact.path.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    artifacts.push(artifact)
  }

  push({
    role: 'script',
    disposition: 'non_promotable',
    path: scriptPath,
    relPath: toPosixRel(sandboxRoot, scriptPath),
  })

  push({
    role: 'capture',
    disposition: 'temp',
    path: captureAbsolutePath,
    relPath: toPosixRel(sandboxRoot, captureAbsolutePath),
  })

  for (const abs of changedPaths) {
    const normalized = path.normalize(abs)
    if (isCaptureLike(normalized, captureAbsolutePath)) continue
    if (normalized === path.normalize(scriptPath)) continue
    const role: ScriptArtifactRole =
      primaryAbs && normalized === primaryAbs ? 'primary' : 'sidecar'
    push({
      role,
      disposition: dispositionForArtifact({
        role,
        absPath: normalized,
        sandboxRoot,
        primaryAbs,
      }),
      path: normalized,
      relPath: toPosixRel(sandboxRoot, normalized),
    })
  }

  if (
    declaredPrimaryAbs &&
    path.normalize(declaredPrimaryAbs) !== path.normalize(captureAbsolutePath) &&
    !artifacts.some((a) => a.role === 'primary')
  ) {
    const normalizedPrimary = path.normalize(declaredPrimaryAbs)
    push({
      role: 'primary',
      disposition: 'deliverable',
      path: normalizedPrimary,
      relPath: toPosixRel(sandboxRoot, normalizedPrimary),
    })
  }

  return artifacts
}

const MAX_PRIMARY_PREVIEW_BYTES = 48 * 1024

export async function readPrimaryArtifactPreview(
  artifacts: ScriptArtifact[],
  sandboxRoot?: string,
): Promise<{ text: string; relPath: string } | null> {
  const primary =
    artifacts.find((a) => a.role === 'primary') ??
    artifacts.find((a) => a.role === 'sidecar' && TEXT_EXTENSIONS.has(path.extname(a.path).toLowerCase()))

  if (!primary) return null

  const abs = path.isAbsolute(primary.path)
    ? primary.path
    : sandboxRoot
      ? path.join(sandboxRoot, primary.relPath)
      : primary.path

  try {
    const buf = await fs.readFile(abs)
    const slice = buf.subarray(0, Math.min(buf.length, MAX_PRIMARY_PREVIEW_BYTES))
    const text = slice.toString('utf8').trim()
    if (!text) return null
    const suffix = buf.length > MAX_PRIMARY_PREVIEW_BYTES ? '\n…[truncated]' : ''
    return { text: text + suffix, relPath: primary.relPath }
  } catch {
    return null
  }
}
