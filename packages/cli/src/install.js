/**
 * Shared install helpers for `teralexi skill|extension` (Node-only, no Electron).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'

export const HOME = join(homedir(), '.teralexi')

export const SKILL_MARKERS = [
  'skill.md',
  'SKILL.md',
  'Skill.md',
  'skills.md',
  'Skills.md',
  'AGENT.md',
  'agent.md',
  'agents.md',
  'Agents.md',
  'AGENTS.md',
]

const PROPERTY_KEY_ALIASES = {
  'allowed-tools': 'allowed_tools',
  allowedTools: 'allowed_tools',
}

export function ensureHomeDirs() {
  for (const dir of [
    HOME,
    join(HOME, 'config'),
    join(HOME, 'skills'),
    join(HOME, 'extensions'),
    join(HOME, 'workspace'),
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}

export function resolveInstallRoot(kind, project) {
  if (project) {
    return join(process.cwd(), '.teralexi', kind)
  }
  return join(HOME, kind)
}

export function parseGithubSource(source) {
  const trimmed = String(source || '').trim()
  if (!trimmed) return null

  // Prefer an existing local path when this is not an http(s) URL.
  let isHttpUrl = false
  try {
    const parsedUrl = new URL(trimmed)
    isHttpUrl =
      parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    isHttpUrl = false
  }
  if (!isHttpUrl && existsSync(trimmed)) {
    return { kind: 'local', path: trimmed, defaultId: basename(trimmed) }
  }

  const treeMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+(?:\/(.+))?)?\/?$/i,
  )
  if (treeMatch) {
    const [, owner, repo, subPath = ''] = treeMatch
    return {
      kind: 'git',
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      subPath: subPath.replace(/\/$/, ''),
      defaultId: subPath ? basename(subPath) : repo,
    }
  }

  const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/)
  if (shortMatch) {
    const [, owner, repo] = shortMatch
    return {
      kind: 'git',
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      subPath: '',
      defaultId: repo,
    }
  }

  if (existsSync(trimmed)) {
    return { kind: 'local', path: trimmed, defaultId: basename(trimmed) }
  }
  return null
}

export function findMarkerFile(dir, markers) {
  for (const name of markers) {
    const path = join(dir, name)
    if (existsSync(path)) return path
  }
  try {
    const wanted = new Set(markers.map((m) => m.toLowerCase()))
    for (const entry of readdirSync(dir)) {
      if (wanted.has(entry.toLowerCase())) return join(dir, entry)
    }
  } catch {
    // ignore
  }
  return null
}

export function hasSkillMarker(dir) {
  return findMarkerFile(dir, SKILL_MARKERS) != null
}

export function hasExtensionMarker(dir) {
  return existsSync(join(dir, 'extension.json'))
}

function walkForRoot(root, predicate, depth = 0) {
  if (depth > 5) return null
  if (predicate(root)) return root
  let entries
  try {
    entries = readdirSync(root)
  } catch {
    return null
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const folder = join(root, entry)
    try {
      if (!statSync(folder).isDirectory()) continue
    } catch {
      continue
    }
    const hit = walkForRoot(folder, predicate, depth + 1)
    if (hit) return hit
  }
  return null
}

export function findSkillRoot(cloneDir, subPath = '') {
  const preferred = subPath ? join(cloneDir, subPath) : cloneDir
  if (hasSkillMarker(preferred)) return preferred
  const underSkills = join(cloneDir, 'skills', basename(subPath) || '')
  if (subPath && hasSkillMarker(underSkills)) return underSkills
  return walkForRoot(cloneDir, hasSkillMarker)
}

export function findExtensionRoot(cloneDir, subPath = '') {
  const preferred = subPath ? join(cloneDir, subPath) : cloneDir
  if (hasExtensionMarker(preferred)) return preferred
  const underExt = join(cloneDir, 'extensions', basename(subPath) || '')
  if (subPath && hasExtensionMarker(underExt)) return underExt
  return walkForRoot(cloneDir, hasExtensionMarker)
}

function parseKv(raw) {
  const out = {}
  for (const line of String(raw || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^([\w.-]+):\s*(.+)$/)
    if (!m) continue
    const key = PROPERTY_KEY_ALIASES[m[1]] || m[1]
    let val = m[2].trim()
    if (key === 'allowed_tools') {
      val = val
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .join(', ')
    }
    out[key] = val
  }
  return out
}

function extractFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\n([\s\S]*?)\n---\n?/)
  return match?.[1]?.trim() || ''
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\n[\s\S]*?\n---\n?/, '')
}

/** Normalize ecosystem skill packs into Teralexi skill.md + properties.md. */
export function normalizeInstalledSkill(skillFolder, skillId) {
  const marker = findMarkerFile(skillFolder, SKILL_MARKERS)
  if (!marker) throw new Error('No skill instruction marker found')

  const raw = readFileSync(marker, 'utf8')
  const fm = extractFrontmatter(raw)
  const body = fm ? stripFrontmatter(raw).trimStart() : raw
  const target = join(skillFolder, 'skill.md')
  writeFileSync(target, body, 'utf8')

  if (marker !== target && marker.toLowerCase() !== target.toLowerCase()) {
    try {
      rmSync(marker)
    } catch {
      // keep duplicate on case-insensitive FS
    }
  }

  const kv = parseKv(fm)
  if (!kv.name) kv.name = skillId
  if (kv.description == null) kv.description = ''
  if (!kv.model) kv.model = 'gemma4'
  if (!kv.provider) kv.provider = 'ollama'
  if (!kv.color) kv.color = 'primary'
  if (!kv.enabled) kv.enabled = 'true'

  const existingPath = join(skillFolder, 'properties.md')
  if (existsSync(existingPath)) {
    Object.assign(kv, parseKv(readFileSync(existingPath, 'utf8')))
  }

  const order = [
    'name',
    'description',
    'model',
    'provider',
    'color',
    'enabled',
    'allowed_tools',
  ]
  const keys = [
    ...order.filter((k) => k in kv),
    ...Object.keys(kv).filter((k) => !order.includes(k)),
  ]
  writeFileSync(
    existingPath,
    `${keys.map((k) => `${k}: ${kv[k]}`).join('\n')}\n`,
    'utf8',
  )
}

function materializeSource(parsed) {
  if (parsed.kind === 'local') {
    return { root: parsed.path, cleanup: null }
  }
  const tempDir = mkdtempSync(join(tmpdir(), 'teralexi-cli-'))
  const r = spawnSync(
    'git',
    ['clone', '--depth', '1', parsed.cloneUrl, tempDir],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    rmSync(tempDir, { recursive: true, force: true })
    throw new Error(r.stderr?.trim() || 'git clone failed')
  }
  return {
    root: tempDir,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  }
}

export function installSkill(source, opts = {}) {
  ensureHomeDirs()
  const parsed = parseGithubSource(source)
  if (!parsed) {
    return {
      ok: false,
      error: 'Invalid source. Use owner/repo, GitHub URL, or local path.',
    }
  }
  const id = String(opts.id || parsed.defaultId)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!id) return { ok: false, error: 'skill id is required' }

  let cleanup = null
  try {
    const mat = materializeSource(parsed)
    cleanup = mat.cleanup
    const skillRoot = findSkillRoot(mat.root, parsed.subPath || '')
    if (!skillRoot) {
      return {
        ok: false,
        error:
          'No skill instruction file found (skill.md, SKILL.md, skills.md, AGENT.md, …).',
      }
    }
    const destRoot = resolveInstallRoot('skills', Boolean(opts.project))
    mkdirSync(destRoot, { recursive: true })
    const dest = join(destRoot, id)
    cpSync(skillRoot, dest, { recursive: true, force: true })
    normalizeInstalledSkill(dest, id)
    return { ok: true, id, path: dest }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    cleanup?.()
  }
}

export function installExtension(source, opts = {}) {
  ensureHomeDirs()
  const parsed = parseGithubSource(source)
  if (!parsed) {
    return {
      ok: false,
      error: 'Invalid source. Use owner/repo, GitHub URL, or local path.',
    }
  }
  const id = String(opts.id || parsed.defaultId)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!id) return { ok: false, error: 'extension id is required' }

  let cleanup = null
  try {
    const mat = materializeSource(parsed)
    cleanup = mat.cleanup
    const extRoot = findExtensionRoot(mat.root, parsed.subPath || '')
    if (!extRoot) {
      return { ok: false, error: 'No extension.json found in source.' }
    }
    const destRoot = resolveInstallRoot('extensions', Boolean(opts.project))
    mkdirSync(destRoot, { recursive: true })
    const dest = join(destRoot, id)
    cpSync(extRoot, dest, { recursive: true, force: true })
    return { ok: true, id, path: dest }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    cleanup?.()
  }
}

export function listInstalled(kind, project) {
  const root = resolveInstallRoot(kind, project)
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((entry) => {
      const folder = join(root, entry)
      try {
        if (!statSync(folder).isDirectory()) return false
      } catch {
        return false
      }
      return kind === 'skills'
        ? hasSkillMarker(folder)
        : hasExtensionMarker(folder)
    })
    .sort()
}

export function removeInstalled(kind, id, project) {
  const dest = join(resolveInstallRoot(kind, project), id)
  if (!existsSync(dest)) return { ok: false, error: `${kind} not found: ${id}` }
  rmSync(dest, { recursive: true, force: true })
  return { ok: true, id, path: dest }
}
