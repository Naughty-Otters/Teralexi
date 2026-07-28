import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import {
  getTeralexiExtensionsDir,
  getTeralexiSkillsDir,
  getTeralexiToolSetDir,
} from '@config/teralexi-home'
import { joinAppResourcePath } from '@main/config/app-paths'
import { getBundledSkillIds, isBundledSkillId } from './bundled-skills-manifest'
import type { SkillToolOs } from './types'
import { EXTENSION_FILES, SKILL_FILES, SKILLS_RESERVED_DIR_NAMES } from './constants'
import { buildDefaultPropertiesYaml } from './llm-constants'
import {
  canonicalizeSkillProperties,
  canonicalizeSkillPropertyKey,
  findSkillMarkdownPath,
  hasSkillInstructionMarker,
  normalizeAllowedToolsList,
} from './skill-ecosystem'

const RESERVED_SKILL_DIR_NAMES = new Set(SKILLS_RESERVED_DIR_NAMES)

export type SkillsSources = {
  /** Shipped defaults (repo or app bundle). */
  bundled: string
  /** Project overrides under `<workspace>/.teralexi/skills`. Null when no usable workspace. */
  project: string | null
  /** User overrides under `~/.teralexi/skills`. */
  user: string
}

/**
 * Packaged macOS apps launched from Finder often have `process.cwd() === '/'`.
 * Using that as a project root yields `/.teralexi/skills` and mkdir fails LoadSkills.
 */
export function isUsableProjectWorkspaceRoot(dir: string | undefined | null): boolean {
  if (!dir?.trim()) return false
  const resolved = resolve(dir.trim())
  if (resolved === '/' || /^[A-Za-z]:[\\/]?$/.test(resolved)) return false
  // Never treat the app bundle itself as a user project workspace.
  if (/\.app\/Contents(\/|$)/i.test(resolved.replace(/\\/g, '/'))) return false
  return true
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
  return hasSkillInstructionMarker(skillFolder)
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
  return joinAppResourcePath('skills')
}

/** Shipped defaults: `<repo>/toolSet` or `<app>/toolSet` when packaged. */
export function resolveBundledToolSetDirectory(): string {
  return joinAppResourcePath(SKILL_FILES.TOOL_SET_DIR)
}

/** `~/.teralexi/skills` — user-installed skills; wins on id conflicts. */
export function resolveUserSkillsDirectory(): string {
  return getTeralexiSkillsDir()
}

/** Project-scoped skills: `<workspace>/.teralexi/skills` (npx skills project scope). */
export function resolveProjectSkillsDirectory(
  workspacePath?: string,
): string | null {
  const explicit = workspacePath?.trim()
  const base = explicit || process.cwd()
  if (!isUsableProjectWorkspaceRoot(base)) return null
  return join(resolve(base), '.teralexi', 'skills')
}

export function resolveSkillsSources(workspacePath?: string): SkillsSources {
  return {
    bundled: resolveBundledSkillsDirectory(),
    project: resolveProjectSkillsDirectory(workspacePath),
    user: resolveUserSkillsDirectory(),
  }
}

/**
 * Skills roots in merge order: bundled → project → user (later overwrites earlier).
 */
export function resolveSkillsSourceRoots(workspacePath?: string): string[] {
  const { bundled, project, user } = resolveSkillsSources(workspacePath)
  return project ? [bundled, project, user] : [bundled, user]
}

/** User overrides: `~/.teralexi/toolSet`. */
export function resolveUserToolSetDirectory(): string {
  return getTeralexiToolSetDir()
}

/**
 * Shared tool roots in merge order: bundled first, user last (user overwrites).
 * ToolSet lives beside `skills/`, not inside it.
 */
export function resolveToolSetSourceRoots(): string[] {
  return [resolveBundledToolSetDirectory(), resolveUserToolSetDirectory()]
}

/**
 * An extension folder is loadable when it has an `extension.json` manifest —
 * the same "marker file decides the folder is loadable" rule `skill.md` plays
 * for skills. A skill-only folder with no `extension.json` is just a skill,
 * not additionally scanned as an extension.
 */
export function isLoadableExtensionFolder(
  extensionsDir: string,
  entry: string,
): boolean {
  if (isReservedSkillDirName(entry)) return false
  const extensionFolder = join(extensionsDir, entry)
  try {
    if (!statSync(extensionFolder).isDirectory()) return false
  } catch {
    return false
  }
  return existsSync(join(extensionFolder, EXTENSION_FILES.MANIFEST_JSON))
}

/** Shipped defaults: `<repo>/extensions` or `<app>/extensions` when packaged. */
export function resolveBundledExtensionsDirectory(): string {
  return joinAppResourcePath('extensions')
}

/** `~/.teralexi/extensions` — user-installed extensions; wins on id conflicts. */
export function resolveUserExtensionsDirectory(): string {
  return getTeralexiExtensionsDir()
}

/** Extension roots in merge order: bundled first, user last (user overwrites bundled). */
export function resolveExtensionsSourceRoots(workspacePath?: string): string[] {
  const project = resolveProjectExtensionsDirectory(workspacePath)
  return [
    resolveBundledExtensionsDirectory(),
    ...(project ? [project] : []),
    resolveUserExtensionsDirectory(),
  ]
}

/** Project-scoped extensions: `<workspace>/.teralexi/extensions`. */
export function resolveProjectExtensionsDirectory(
  workspacePath?: string,
): string | null {
  const explicit = workspacePath?.trim()
  const base = explicit || process.cwd()
  if (!isUsableProjectWorkspaceRoot(base)) return null
  return join(resolve(base), '.teralexi', 'extensions')
}

/** True when the user has a disk folder that overrides a shipped bundled skill. */
export function userOverridesBundledSkill(skillId: string): boolean {
  const userDir = resolveUserSkillsDirectory()
  return isLoadableSkillFolder(userDir, skillId)
}

/** Shipped bundled skill that is not replaced by a user folder on disk. */
export function isEffectiveBundledSkill(skillId: string): boolean {
  return isBundledSkillId(skillId) && !userOverridesBundledSkill(skillId)
}

/** Which skills tree owns the effective folder for this id. */
export function resolveSkillCompilationSource(
  skillId: string,
  workspacePath?: string,
): 'user' | 'project' | 'bundled' | null {
  const { bundled, project, user } = resolveSkillsSources(workspacePath)
  if (isLoadableSkillFolder(user, skillId)) return 'user'
  if (project && isLoadableSkillFolder(project, skillId)) return 'project'
  if (isLoadableSkillFolder(bundled, skillId)) return 'bundled'
  if (isEffectiveBundledSkill(skillId)) return 'bundled'
  return null
}

/** User skill folder if present, otherwise project, otherwise bundled. */
export function resolveSkillFolder(
  skillId: string,
  workspacePath?: string,
): string | null {
  const { bundled, project, user } = resolveSkillsSources(workspacePath)
  if (isLoadableSkillFolder(user, skillId)) return join(user, skillId)
  if (project && isLoadableSkillFolder(project, skillId)) return join(project, skillId)
  if (isLoadableSkillFolder(bundled, skillId)) return join(bundled, skillId)
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
  for (const skillId of getBundledSkillIds()) {
    if (isEffectiveBundledSkill(skillId)) {
      byId.set(skillId, true)
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

export function normalizeSkillFileText(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function extractYamlFrontmatterBlock(markdown: string): string | null {
  const match = normalizeSkillFileText(markdown).match(
    /^---\n([\s\S]*?)\n---\n?/,
  )
  if (!match?.[1]?.trim()) return null
  return match[1].trim()
}

export function stripYamlFrontmatter(markdown: string): string {
  return normalizeSkillFileText(markdown).replace(/^---\n[\s\S]*?\n---\n?/, '')
}

/** Parse `key: value` lines without aliases or defaults. */
export function parsePropertiesKeyValuesRaw(
  raw: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of normalizeSkillFileText(raw).split('\n')) {
    const m = line.match(/^([\w.-]+):\s*(.+)$/)
    if (!m) continue
    out[m[1]] = m[2].trim()
  }
  return out
}

export function parsePropertiesKeyValues(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [rawKey, rawVal] of Object.entries(
    parsePropertiesKeyValuesRaw(raw),
  )) {
    const key = canonicalizeSkillPropertyKey(rawKey)
    let val = rawVal
    if (key === 'allowed_tools') {
      val = normalizeAllowedToolsList(val)
    }
    out[key] = val
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
  return serializePropertiesKeyValues(
    canonicalizeSkillProperties({
      ...parsePropertiesKeyValuesRaw(baseRaw),
      ...parsePropertiesKeyValuesRaw(overrideRaw),
    }),
  )
}

export function resolvePropertiesRawFromContent(
  skillId: string,
  skillRaw: string,
  propertiesFromFile: string,
  opts?: { displayName?: string },
): string {
  const frontmatter = extractYamlFrontmatterBlock(skillRaw) ?? ''
  const merged = canonicalizeSkillProperties(
    {
      ...parsePropertiesKeyValuesRaw(frontmatter),
      ...parsePropertiesKeyValuesRaw(propertiesFromFile),
    },
    { skillId, displayName: opts?.displayName },
  )

  if (
    !frontmatter.trim() &&
    !propertiesFromFile.trim() &&
    !opts?.displayName
  ) {
    const displayName = skillId
      .split(/[-_]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    return buildDefaultPropertiesYaml(displayName, skillId)
  }

  return serializePropertiesKeyValues(merged)
}

export function resolvePropertiesRaw(
  skillId: string,
  skillFolder: string,
  skillRaw: string,
): string {
  const propertiesFile = join(skillFolder, SKILL_FILES.PROPERTIES_MD)
  const propertiesFromFile = existsSync(propertiesFile)
    ? normalizeSkillFileText(readFileSync(propertiesFile, 'utf-8'))
    : ''

  return resolvePropertiesRawFromContent(skillId, skillRaw, propertiesFromFile)
}

/** Re-export for callers that only need marker discovery. */
export { findSkillMarkdownPath, hasSkillInstructionMarker }
