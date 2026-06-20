import { writeFile } from 'fs/promises'
import { existsSync, readdirSync, type Dirent } from 'fs'
import { basename, isAbsolute, join } from 'path'
import {
  ReferenceDoc,
  ReferenceScript,
} from './reference-resource'

export function isRemoteReferenceUrl(s: string): boolean {
  const t = s.trim().toLowerCase()
  return t.startsWith('http://') || t.startsWith('https://')
}

export function resolveReferenceUrlToFilesystemPath(
  referenceUrl: string,
  sandboxRoot: string,
): string {
  const u = referenceUrl.trim()
  if (!u) throw new Error('Empty reference_url')
  if (isRemoteReferenceUrl(u)) {
    throw new Error('resolveReferenceUrlToFilesystemPath: remote URL not supported')
  }
  if (isAbsolute(u)) return u
  return join(sandboxRoot, u.replace(/^[/\\]+/, ''))
}

export function normalizeReferenceScriptType(
  raw: string | undefined,
): 'python' | 'node' | 'bash' {
  const t = (raw ?? '').trim().toLowerCase()
  if (
    t === 'node' ||
    t === 'nodejs' ||
    t === 'javascript' ||
    t === 'js' ||
    t === 'mjs' ||
    t === 'cjs'
  ) {
    return 'node'
  }
  if (t === 'python' || t === 'py') return 'python'
  if (
    t === 'bash' ||
    t === 'sh' ||
    t === 'shell' ||
    t === 'zsh' ||
    t === 'fish'
  ) {
    return 'bash'
  }
  return 'bash'
}

export function ensureReferenceDoc(
  d: ReferenceDoc | Record<string, unknown>,
): ReferenceDoc {
  if (d instanceof ReferenceDoc) return d
  return ReferenceDoc.fromPlain(
    d as { name?: string; path?: string; reference_url?: string },
  )
}

export function ensureReferenceScript(
  s: ReferenceScript | Record<string, unknown>,
): ReferenceScript {
  if (s instanceof ReferenceScript) return s
  return ReferenceScript.fromPlain(
    s as { script_type?: string; path?: string; reference_url?: string },
  )
}

export function referenceLocationString(
  r: { reference_url?: string; path?: string },
): string {
  const o = r as { reference_url?: string; path?: string }
  return (o.reference_url ?? o.path ?? '').trim()
}

/** Display / match label derived from `reference_url` (basename, no query string). */
export function referenceDocBasename(reference_url: string): string {
  const u = reference_url.trim().replace(/\\/g, '/')
  if (!u) return ''
  const withoutQuery = u.split('?')[0] ?? u
  const parts = withoutQuery.split('/')
  return parts[parts.length - 1] ?? withoutQuery
}

export type SandboxReferenceLayout = {
  root: string
  refsDir: string
  skillsDir: string
}

/** Depth-first search for a file by basename under an existing directory. */
function findFileByBasenameUnder(dir: string, fileBase: string): string | null {
  if (!existsSync(dir)) return null

  const direct = join(dir, fileBase)
  if (existsSync(direct)) return direct

  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[]
  } catch {
    return null
  }

  for (const entry of entries) {
    const child = join(dir, entry.name)
    if (entry.isFile() && entry.name === fileBase) return child
    if (entry.isDirectory()) {
      const nested = findFileByBasenameUnder(child, fileBase)
      if (nested) return nested
    }
  }
  return null
}

/**
 * Resolve a local reference for **reading** inside an initialized sandbox.
 * Search order: sandbox root → materialized refs copy → sandbox skills tree.
 */
export function resolveReferenceReadPathInSandbox(
  reference_url: string,
  layout: SandboxReferenceLayout,
  skillId?: string,
): string | null {
  const u = reference_url.trim()
  if (!u || isRemoteReferenceUrl(u)) return null

  if (isAbsolute(u)) {
    return existsSync(u) ? u : null
  }

  const rel = u.replace(/^[/\\]+/, '')
  const fileBase = basename(rel)
  const candidates: string[] = [
    join(layout.root, rel),
    join(layout.refsDir, rel),
    join(layout.refsDir, fileBase),
  ]
  if (skillId?.trim()) {
    candidates.push(join(layout.skillsDir, skillId.trim(), rel))
  }
  candidates.push(join(layout.skillsDir, rel))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  if (skillId?.trim()) {
    const skillRoot = join(layout.skillsDir, skillId.trim())
    const found = findFileByBasenameUnder(skillRoot, fileBase)
    if (found) return found
  }

  return null
}

export function resolveLocalSourcePathForReferenceCopy(
  reference_url: string,
  layout: { skillsDir: string; root: string },
  skillId?: string,
): string | null {
  const u = reference_url.trim()
  if (!u || isRemoteReferenceUrl(u)) return null

  if (isAbsolute(u) && existsSync(u)) return u

  const rel = u.replace(/^[/\\]+/, '')
  if (skillId?.trim()) {
    const underSkill = join(layout.skillsDir, skillId.trim(), rel)
    if (existsSync(underSkill)) return underSkill
  }
  const underSkills = join(layout.skillsDir, rel)
  if (existsSync(underSkills)) return underSkills
  const underRoot = join(layout.root, rel)
  if (existsSync(underRoot)) return underRoot
  return null
}

export async function writeRemoteReferenceToFile(
  url: string,
  destPath: string,
  opts?: { abortSignal?: AbortSignal; fetchTimeoutMs?: number },
): Promise<void> {
  const fetchTimeoutMs = opts?.fetchTimeoutMs ?? 30_000
  let signal: AbortSignal
  if (opts?.abortSignal) {
    try {
      signal = AbortSignal.any([
        opts.abortSignal,
        AbortSignal.timeout(fetchTimeoutMs),
      ] as AbortSignal[])
    } catch {
      signal = opts.abortSignal
    }
  } else {
    signal = AbortSignal.timeout(fetchTimeoutMs)
  }

  const res = await fetch(url.trim(), { signal, redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Remote reference fetch failed: HTTP ${res.status}`)
  }
  const body = await res.arrayBuffer()
  await writeFile(destPath, Buffer.from(body))
}
