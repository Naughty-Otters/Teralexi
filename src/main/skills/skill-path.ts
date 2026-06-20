import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { getopenfdeSkillsDir, getopenfdeToolSetDir } from '@config/openfde-home'
import { app } from 'electron'
import type { SkillToolOs } from './types'
import { SKILL_FILES, SKILLS_RESERVED_DIR_NAMES } from './constants'
import { buildDefaultPropertiesYaml } from './llm-constants'

const RESERVED_SKILL_DIR_NAMES = new Set(SKILLS_RESERVED_DIR_NAMES)

export type SkillsSources = {
  /** Shipped defaults (repo or app bundle). */
  bundled: string
  /** User overrides under `~/.openfde/skills`. */
  user: string
}

export function getHostToolOs(): SkillToolOs {
  switch (process.platform) {
    case 'darwin':
      return 'mac'
    case 'win32':
      return 'win'
    default:
      return 'linux'
  }
}

export function isReservedSkillDirName(name: string): boolean {
  return RESERVED_SKILL_DIR_NAMES.has(name) || name.startsWith('.')
}

export function isLoadableSkillFolder(
  skillsDir: string,
  entry: string,
): boolean {
  if (isReservedSkillDirName(entry)) return false
  const skillFolder = join(skillsDir, entry)
  try {
    if (!statSync(skillFolder).isDirectory()) return false
  } catch {
    return false
  }
  return existsSync(join(skillFolder, SKILL_FILES.SKILL_MD))
}

function listLoadableSkillIds(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return []
  let entries: string[]
  try {
    entries = readdirSync(skillsDir)
  } catch {
    return []
  }
  return entries.filter((entry) => isLoadableSkillFolder(skillsDir, entry))
}

/** Repo or packaged `skills/` tree (defaults). */
export function resolveBundledSkillsDirectory(): string {
  if (app?.isPackaged) {
    return join(app.getAppPath(), 'skills')
  }
  return join(process.cwd(), 'skills')
}

/** `~/.openfde/skills` — user-installed skills; wins on id conflicts. */
export function resolveUserSkillsDirectory(): string {
  return getopenfdeSkillsDir()
}

export function resolveSkillsSources(): SkillsSources {
  return {
    bundled: resolveBundledSkillsDirectory(),
    user: resolveUserSkillsDirectory(),
  }
}

/**
 * Skills roots in merge order: bundled first, user last (user overwrites bundled).
 */
export function resolveSkillsSourceRoots(): string[] {
  const { bundled, user } = resolveSkillsSources()
  return [bundled, user]
}

/** Shipped defaults: `<repo>/toolSet` or `<app>/toolSet` when packaged. */
export function resolveBundledToolSetDirectory(): string {
  if (app?.isPackaged) {
    return join(app.getAppPath(), SKILL_FILES.TOOL_SET_DIR)
  }
  return join(process.cwd(), SKILL_FILES.TOOL_SET_DIR)
}

/** User overrides: `~/.openfde/toolSet`. */
export function resolveUserToolSetDirectory(): string {
  return getopenfdeToolSetDir()
}

/**
 * Shared tool roots in merge order: bundled first, user last (user overwrites).
 * ToolSet lives beside `skills/`, not inside it.
 */
export function resolveToolSetSourceRoots(): string[] {
  return [resolveBundledToolSetDirectory(), resolveUserToolSetDirectory()]
}

/** Which skills tree owns the effective folder for this id. */
export function resolveSkillCompilationSource(
  skillId: string,
): 'user' | 'bundled' | null {
  const { bundled, user } = resolveSkillsSources()
  if (isLoadableSkillFolder(user, skillId)) return 'user'
  if (isLoadableSkillFolder(bundled, skillId)) return 'bundled'
  return null
}

/** User skill folder if present, otherwise bundled. */
export function resolveSkillFolder(skillId: string): string | null {
  const { bundled, user } = resolveSkillsSources()
  const userFolder = join(user, skillId)
  if (isLoadableSkillFolder(user, skillId)) return userFolder
  const bundledFolder = join(bundled, skillId)
  if (isLoadableSkillFolder(bundled, skillId)) return bundledFolder
  return null
}

/** Merged skill ids (user overrides bundled for the same folder name). */
export function resolveLoadableSkillIds(): string[] {
  const byId = new Map<string, true>()
  for (const root of resolveSkillsSourceRoots()) {
    for (const id of listLoadableSkillIds(root)) {
      byId.set(id, true)
    }
  }
  return Array.from(byId.keys())
}

/**
 * @deprecated Use {@link resolveUserSkillsDirectory} for the user install path, or
 * {@link loadSkills} for merged catalog loading.
 */
export function resolveSkillsRootDirectory(): string {
  return resolveUserSkillsDirectory()
}

export function extractYamlFrontmatterBlock(markdown: string): string | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match?.[1]?.trim()) return null
  return match[1].trim()
}

export function stripYamlFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

export function parsePropertiesKeyValues(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.+)$/)
    if (!m) continue
    out[m[1]] = m[2].trim()
  }
  return out
}

const PROPERTY_KEY_ORDER = [
  'name',
  'description',
  'model',
  'provider',
  'color',
  'enabled',
  'visibility',
  'allowed_tools',
  'max_iterations',
  'refs_dir',
  'scripts_dir',
  'form_dir',
] as const

export function serializePropertiesKeyValues(
  kv: Record<string, string>,
): string {
  const ordered = [
    ...PROPERTY_KEY_ORDER.filter((key) => key in kv),
    ...Object.keys(kv).filter(
      (key) => !(PROPERTY_KEY_ORDER as readonly string[]).includes(key),
    ),
  ]
  return `${ordered.map((key) => `${key}: ${kv[key]}`).join('\n')}\n`
}

/** Merge skill.md YAML frontmatter with properties.md; file values override skill. */
export function mergePropertiesRaw(baseRaw: string, overrideRaw: string): string {
  return serializePropertiesKeyValues({
    ...parsePropertiesKeyValues(baseRaw),
    ...parsePropertiesKeyValues(overrideRaw),
  })
}

export function resolvePropertiesRaw(
  skillId: string,
  skillFolder: string,
  skillRaw: string,
): string {
  const propertiesFile = join(skillFolder, SKILL_FILES.PROPERTIES_MD)
  const propertiesFromFile = existsSync(propertiesFile)
    ? readFileSync(propertiesFile, 'utf-8')
    : ''

  const frontmatter = extractYamlFrontmatterBlock(skillRaw) ?? ''
  if (frontmatter.trim() || propertiesFromFile.trim()) {
    return mergePropertiesRaw(frontmatter, propertiesFromFile)
  }

  const displayName = skillId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return buildDefaultPropertiesYaml(displayName, skillId)
}
