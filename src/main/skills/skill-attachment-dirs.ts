import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { SKILL_FILES, SKILLS_RESERVED_DIR_NAMES } from './constants'
import {
  getBundledSkillSource,
  isBundledSkillId,
} from './bundled-skills-manifest'
import {
  isLoadableSkillFolder,
  resolveSkillFolder,
  resolveUserSkillsDirectory,
} from './skill-path'

export type SkillAttachmentCategory = 'ref' | 'script' | 'form'

export type SkillAttachmentDirs = Record<SkillAttachmentCategory, string[]>

export const DEFAULT_SKILL_ATTACHMENT_DIRS: SkillAttachmentDirs = {
  ref: ['refs'],
  script: ['scripts'],
  form: ['form'],
}

const RESERVED_ATTACHMENT_DIR_SEGMENTS = new Set<string>([
  ...SKILLS_RESERVED_DIR_NAMES,
  SKILL_FILES.ACTIONS_DIR,
  SKILL_FILES.TOOL_SET_DIR,
])

function parsePropertiesKeyValues(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.+)$/)
    if (!m) continue
    out[m[1]] = m[2].trim()
  }
  return out
}

/** Split `refs_dir` / `scripts_dir` / `form_dir` values (comma-separated lists). */
export function splitAttachmentDirPropertyValue(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Normalize one skill-relative attachment directory segment.
 * Returns empty string when invalid (caller supplies fallback for single-dir API).
 */
export function tryNormalizeAttachmentDir(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/')
  if (!trimmed) return ''

  const segments = trimmed.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return ''

  for (const seg of segments) {
    if (seg === '.' || seg === '..' || seg.startsWith('.')) return ''
    if (RESERVED_ATTACHMENT_DIR_SEGMENTS.has(seg)) return ''
  }

  if (trimmed.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(trimmed)) {
    return ''
  }

  return segments.join('/')
}

/** Normalize a single dir; invalid values become `fallback`. */
export function normalizeAttachmentDir(
  raw: string | undefined,
  fallback: string,
): string {
  const normalized = tryNormalizeAttachmentDir(raw ?? '')
  return normalized || fallback
}

/** Parse comma-separated dirs; invalid entries skipped; uses `[fallback]` if none valid. */
export function parseAttachmentDirList(
  raw: string | undefined,
  fallback: string,
): string[] {
  const parts = raw?.trim()
    ? splitAttachmentDirPropertyValue(raw)
    : []
  const normalized = parts
    .map((part) => tryNormalizeAttachmentDir(part))
    .filter((dir) => dir.length > 0)
  const unique = [...new Set(normalized)]
  return unique.length > 0 ? unique : [fallback]
}

export function parseAttachmentDirsFromProperties(
  propertiesRaw: string,
): SkillAttachmentDirs {
  const kv = parsePropertiesKeyValues(propertiesRaw)
  return {
    ref: parseAttachmentDirList(
      kv.refs_dir,
      DEFAULT_SKILL_ATTACHMENT_DIRS.ref[0],
    ),
    script: parseAttachmentDirList(
      kv.scripts_dir,
      DEFAULT_SKILL_ATTACHMENT_DIRS.script[0],
    ),
    form: parseAttachmentDirList(kv.form_dir, DEFAULT_SKILL_ATTACHMENT_DIRS.form[0]),
  }
}

export function resolveSkillAttachmentDirs(
  skillFolder: string,
): SkillAttachmentDirs {
  const propertiesFile = join(skillFolder, SKILL_FILES.PROPERTIES_MD)
  if (!existsSync(propertiesFile)) {
    return {
      ref: [...DEFAULT_SKILL_ATTACHMENT_DIRS.ref],
      script: [...DEFAULT_SKILL_ATTACHMENT_DIRS.script],
      form: [...DEFAULT_SKILL_ATTACHMENT_DIRS.form],
    }
  }
  try {
    return parseAttachmentDirsFromProperties(
      readFileSync(propertiesFile, 'utf-8'),
    )
  } catch {
    return {
      ref: [...DEFAULT_SKILL_ATTACHMENT_DIRS.ref],
      script: [...DEFAULT_SKILL_ATTACHMENT_DIRS.script],
      form: [...DEFAULT_SKILL_ATTACHMENT_DIRS.form],
    }
  }
}

function resolveBundledSkillAttachmentDirs(skillId: string): SkillAttachmentDirs {
  const source = getBundledSkillSource(skillId)
  if (!source?.propertiesMd.trim()) {
    return {
      ref: [...DEFAULT_SKILL_ATTACHMENT_DIRS.ref],
      script: [...DEFAULT_SKILL_ATTACHMENT_DIRS.script],
      form: [...DEFAULT_SKILL_ATTACHMENT_DIRS.form],
    }
  }
  return parseAttachmentDirsFromProperties(source.propertiesMd)
}

export function resolveFormAttachmentDirsForSkill(
  skillId: string | undefined,
): string[] {
  const id = skillId?.trim()
  if (!id) return [...DEFAULT_SKILL_ATTACHMENT_DIRS.form]

  const userDir = resolveUserSkillsDirectory()
  if (isLoadableSkillFolder(userDir, id)) {
    return resolveSkillAttachmentDirs(join(userDir, id)).form
  }

  const folder = resolveSkillFolder(id)
  if (folder && existsSync(join(folder, SKILL_FILES.SKILL_MD))) {
    return resolveSkillAttachmentDirs(folder).form
  }

  if (isBundledSkillId(id)) {
    return resolveBundledSkillAttachmentDirs(id).form
  }

  return [...DEFAULT_SKILL_ATTACHMENT_DIRS.form]
}

/** @deprecated Use {@link resolveFormAttachmentDirsForSkill}. */
export function resolveFormAttachmentDirForSkill(
  skillId: string | undefined,
): string {
  return resolveFormAttachmentDirsForSkill(skillId)[0] ?? 'form'
}

function formDirMatchesUrl(url: string, formDir: string): boolean {
  const dir = formDir.replace(/\\/g, '/').toLowerCase()
  if (!dir) return false
  return (
    url === dir ||
    url.startsWith(`${dir}/`) ||
    url.includes(`/${dir}/`)
  )
}

/** Whether a planner `reference_url` points at a HITL form document. */
export function referenceUrlLooksLikeForm(
  referenceUrl: string,
  formDirs: string | string[] = DEFAULT_SKILL_ATTACHMENT_DIRS.form,
): boolean {
  const url = referenceUrl.replace(/\\/g, '/').toLowerCase()
  if (url.endsWith('.form.md')) return true

  const dirs = Array.isArray(formDirs) ? formDirs : [formDirs]
  for (const raw of dirs) {
    const dir = tryNormalizeAttachmentDir(raw).toLowerCase()
    if (dir && formDirMatchesUrl(url, dir)) return true
  }

  return false
}
