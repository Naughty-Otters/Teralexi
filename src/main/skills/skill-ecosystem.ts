/**
 * Cross-ecosystem skill pack compatibility (Agent Skills / Codex / Claude Code /
 * Cursor / OpenClaw / ClawHub).
 *
 * Discovery: a folder is a skill when it contains any recognized instruction
 * marker. Prefer Teralexi `skill.md`, then Agent Skills `SKILL.md`, then
 * OpenClaw legacy / AGENT* aliases.
 *
 * Properties: ecosystem packs usually only declare `name` + `description` in
 * YAML frontmatter. We map aliases (`allowed-tools` → `allowed_tools`) and fill
 * Teralexi-required `model` / `provider` defaults when missing.
 */
import { existsSync, readdirSync } from 'fs'
import { basename, join } from 'path'
import { SKILL_DEFAULT_PROPERTIES, SKILL_FILES } from './constants'

/**
 * Ordered preference for the skill instruction file inside a skill folder.
 * First existing match wins.
 */
export const SKILL_INSTRUCTION_MARKERS = [
  /** Teralexi native */
  'skill.md',
  /** Agent Skills standard (Codex, Claude Code, Cursor, OpenClaw, …) */
  'SKILL.md',
  'Skill.md',
  /** OpenClaw / ClawHub legacy */
  'skills.md',
  'Skills.md',
  /** Occasional AGENT* skill-folder markers */
  'AGENT.md',
  'agent.md',
  'agents.md',
  'Agents.md',
  'AGENTS.md',
] as const

/** Workspace-root always-on instruction files (rules, not skill packs). */
export { WORKSPACE_AGENT_RULE_FILES } from '@shared/agent/project-rules'

const PROPERTY_KEY_ALIASES: Record<string, string> = {
  'allowed-tools': 'allowed_tools',
  allowedTools: 'allowed_tools',
  'max-iterations': 'max_iterations',
  maxIterations: 'max_iterations',
  'refs-dir': 'refs_dir',
  refsDir: 'refs_dir',
  'scripts-dir': 'scripts_dir',
  scriptsDir: 'scripts_dir',
  'form-dir': 'form_dir',
  formDir: 'form_dir',
}

/**
 * Find the skill instruction markdown path in a folder, or null if none.
 * Case-sensitive first (exact marker list), then case-insensitive fallback for
 * APFS/exFAT quirks without treating every `.md` as a skill.
 */
export function findSkillMarkdownPath(skillFolder: string): string | null {
  for (const name of SKILL_INSTRUCTION_MARKERS) {
    const path = join(skillFolder, name)
    if (existsSync(path)) return path
  }

  let entries: string[]
  try {
    entries = readdirSync(skillFolder)
  } catch {
    return null
  }

  const wanted = new Set(
    SKILL_INSTRUCTION_MARKERS.map((name) => name.toLowerCase()),
  )
  for (const entry of entries) {
    if (wanted.has(entry.toLowerCase())) {
      return join(skillFolder, entry)
    }
  }
  return null
}

export function hasSkillInstructionMarker(skillFolder: string): boolean {
  return findSkillMarkdownPath(skillFolder) != null
}

/** Canonicalize a single property key (ecosystem → Teralexi). */
export function canonicalizeSkillPropertyKey(key: string): string {
  const trimmed = key.trim()
  return PROPERTY_KEY_ALIASES[trimmed] ?? PROPERTY_KEY_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

/**
 * Normalize ecosystem property bags into Teralexi shape:
 * - alias keys
 * - space- or comma-separated `allowed-tools` → comma-separated `allowed_tools`
 * - fill model/provider/color/enabled when missing
 */
export function canonicalizeSkillProperties(
  kv: Record<string, string>,
  opts?: { skillId?: string; displayName?: string },
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [rawKey, rawVal] of Object.entries(kv)) {
    const key = canonicalizeSkillPropertyKey(rawKey)
    let val = String(rawVal ?? '').trim()
    if (key === 'allowed_tools') {
      val = normalizeAllowedToolsList(val)
    }
    if (!val && key !== 'description') continue
    out[key] = val
  }

  const skillId = opts?.skillId?.trim() || 'skill'
  const displayName =
    opts?.displayName?.trim() ||
    out.name?.trim() ||
    skillId
      .split(/[-_]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') ||
    skillId

  if (!out.name?.trim()) out.name = displayName
  if (out.description == null) out.description = ''
  if (!out.model?.trim()) out.model = SKILL_DEFAULT_PROPERTIES.MODEL
  if (!out.provider?.trim()) out.provider = SKILL_DEFAULT_PROPERTIES.PROVIDER
  if (!out.color?.trim()) out.color = SKILL_DEFAULT_PROPERTIES.COLOR
  if (!out.enabled?.trim()) {
    out.enabled = String(SKILL_DEFAULT_PROPERTIES.ENABLED)
  }

  return out
}

/** Agent Skills uses spaces; Teralexi historically used commas. Accept both. */
export function normalizeAllowedToolsList(raw: string): string {
  const parts = raw
    .split(/[\s,]+/)
    .map((p) => p.trim().replace(/^`|`$/g, ''))
    .filter(Boolean)
  return parts.join(', ')
}

export function skillIdFromFolderName(folderPath: string): string {
  return basename(folderPath).replace(/[^a-zA-Z0-9_-]/g, '-') || 'skill'
}

/** Prefer writing Teralexi `skill.md` when normalizing installs. */
export function teralexiSkillMdPath(skillFolder: string): string {
  return join(skillFolder, SKILL_FILES.SKILL_MD)
}
