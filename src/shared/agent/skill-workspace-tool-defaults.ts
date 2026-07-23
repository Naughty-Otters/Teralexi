import { isApprovalRequiredByDefault } from './mandatory-tools'

/**
 * Default tool enablement + approval policy for shared toolSet categories.
 * Most skills receive file-system / workspace tools by default unless listed
 * in {@link NO_TOOLSET_EXPANSION_SKILL_IDS}.
 */

/** Shared toolSet tags enabled for most skills by default. */
export const DEFAULT_SKILL_TOOLSET_TAGS = [
  'file-system',
  'workspace',
] as const

export type DefaultSkillToolsetTag = (typeof DEFAULT_SKILL_TOOLSET_TAGS)[number]

/** Extra tags auto-enabled for the primary coding skill (not review/pr sub-skills). */
export const CODING_SKILL_TOOLSET_TAGS = [
  ...DEFAULT_SKILL_TOOLSET_TAGS,
  'code-intelligence',
  'planning',
  'task-tracking',
  'sub-agents',
] as const

/** Extra toolSet tags enabled for the research skill by default. */
export const RESEARCH_SKILL_TOOLSET_TAGS = [
  ...DEFAULT_SKILL_TOOLSET_TAGS,
  'web',
  'research',
] as const

/** Skills whose catalog uses only explicit `allowed_tools` — no tag expansion. */
export const NO_TOOLSET_EXPANSION_SKILL_IDS = [
  'default',
  'coding',
  'coding-review',
  'coding-pr',
] as const

/** @deprecated Use {@link DEFAULT_SKILL_TOOLSET_TAGS}. */
export const WORKSPACE_TOOL_TAGS = DEFAULT_SKILL_TOOLSET_TAGS

function isCodingFamilySkill(skillId: string): boolean {
  return skillId === 'coding' || skillId.startsWith('coding-')
}

export function defaultToolsetTagsForSkill(skillId: string): readonly string[] {
  if (skillId === 'default') {
    return []
  }
  if (skillId === 'github') {
    return [...DEFAULT_SKILL_TOOLSET_TAGS, 'github']
  }
  if (skillId === 'research') {
    return RESEARCH_SKILL_TOOLSET_TAGS
  }
  if (skillId === 'coding') {
    return []
  }
  if (skillId === 'coding-review' || skillId === 'coding-pr') {
    return []
  }
  if (isCodingFamilySkill(skillId)) {
    return CODING_SKILL_TOOLSET_TAGS
  }
  return DEFAULT_SKILL_TOOLSET_TAGS
}

/** @deprecated Use {@link defaultToolsetTagsForSkill}. */
export function workspaceToolTagsForSkill(skillId: string): readonly string[] {
  return defaultToolsetTagsForSkill(skillId)
}

export function toolNamesMatchingTags<
  T extends { name: string; tags?: readonly string[] },
>(catalogTools: readonly T[], tags: readonly string[]): string[] {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()))
  return catalogTools
    .filter((tool) =>
      (tool.tags ?? []).some((tag) => tagSet.has(tag.toLowerCase())),
    )
    .map((tool) => tool.name)
}

export function skillUsesToolsetExpansion(skillId: string): boolean {
  return !NO_TOOLSET_EXPANSION_SKILL_IDS.includes(
    skillId as (typeof NO_TOOLSET_EXPANSION_SKILL_IDS)[number],
  )
}

/**
 * Expand `properties.md` `allowed_tools` before building the skill catalog.
 * Skills with an explicit allow-list still receive tag-matched tools unless the
 * skill id is in {@link NO_TOOLSET_EXPANSION_SKILL_IDS}.
 * Returns `undefined` when the skill has no allow-list (full global catalog).
 */
export function expandSkillAllowedToolsForCatalog<
  T extends { name: string; tags?: readonly string[] },
>(
  skillId: string,
  globalTools: readonly T[],
  allowedTools?: readonly string[],
): string[] | undefined {
  const allowed = (allowedTools ?? [])
    .map((name) => name.trim().replace(/^`|`$/g, ''))
    .filter(Boolean)
  if (allowed.length === 0) return undefined

  if (!skillUsesToolsetExpansion(skillId)) {
    return [...new Set(allowed)]
  }

  const defaults = toolNamesMatchingTags(
    globalTools,
    defaultToolsetTagsForSkill(skillId),
  )
  return [...new Set([...allowed, ...defaults])]
}

/** Union tag-matched tools into the skill's enabled set. */
export function expandSkillWorkspaceAvailableSet<
  T extends { name: string; tags?: readonly string[] },
>(
  skillId: string,
  catalogTools: readonly T[],
  availableSet: readonly string[],
): string[] {
  if (!skillUsesToolsetExpansion(skillId)) {
    return [...new Set(availableSet)]
  }

  const workspaceNames = toolNamesMatchingTags(
    catalogTools,
    defaultToolsetTagsForSkill(skillId),
  )
  return [...new Set([...availableSet, ...workspaceNames])]
}

/** Default `toolNeedsApprovalOverrides` — false = run without HITL for toolset tools. */
export function resolveSkillWorkspaceApprovalOverrides<
  T extends { name: string; tags?: readonly string[] },
>(
  skillId: string,
  catalogTools: readonly T[],
  enabledToolNames: readonly string[],
): Record<string, boolean> {
  const enabled = new Set(enabledToolNames)
  const tags = new Set(defaultToolsetTagsForSkill(skillId))
  const overrides: Record<string, boolean> = {}

  for (const tool of catalogTools) {
    if (!enabled.has(tool.name)) continue
    if (isApprovalRequiredByDefault(tool.name)) {
      overrides[tool.name] = true
      continue
    }
    if (!(tool.tags ?? []).some((tag) => tags.has(tag))) continue
    overrides[tool.name] = false
  }

  return overrides
}

export function mergeSkillWorkspaceApprovalOverrides<
  T extends { name: string; tags?: readonly string[] },
>(
  skillId: string,
  catalogTools: readonly T[],
  enabledToolNames: readonly string[],
  savedOverrides: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const saved = savedOverrides ?? {}
  const defaults = resolveSkillWorkspaceApprovalOverrides(
    skillId,
    catalogTools,
    enabledToolNames,
  )
  return { ...defaults, ...saved }
}
