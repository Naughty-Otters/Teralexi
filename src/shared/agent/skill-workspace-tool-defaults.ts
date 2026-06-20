/**
 * Default tool enablement + no-approval policy for shared toolSet categories.
 * Every skill gets `file-system`, `git`, and `workspace` tools enabled by default
 * unless the user saved explicit AvailableSet / approval overrides.
 */

/** Shared toolSet tags enabled for all skills by default. */
export const DEFAULT_SKILL_TOOLSET_TAGS = [
  'file-system',
  'git',
  'workspace',
] as const

export type DefaultSkillToolsetTag = (typeof DEFAULT_SKILL_TOOLSET_TAGS)[number]

/** @deprecated Use {@link DEFAULT_SKILL_TOOLSET_TAGS}. */
export const WORKSPACE_TOOL_TAGS = DEFAULT_SKILL_TOOLSET_TAGS

export function defaultToolsetTagsForSkill(skillId: string): readonly string[] {
  if (skillId === 'github') {
    return [...DEFAULT_SKILL_TOOLSET_TAGS, 'github']
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

/**
 * Expand `properties.md` `allowed_tools` before building the skill catalog.
 * Skills with an explicit allow-list still receive every file-system / git /
 * workspace tool from the shared toolSet. Returns `undefined` when the skill
 * has no allow-list (full global catalog — unchanged behavior).
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

  const defaults = toolNamesMatchingTags(
    globalTools,
    defaultToolsetTagsForSkill(skillId),
  )
  return [...new Set([...allowed, ...defaults])]
}

/** Union file-system / git / workspace tools into the skill's enabled set. */
export function expandSkillWorkspaceAvailableSet<
  T extends { name: string; tags?: readonly string[] },
>(
  skillId: string,
  catalogTools: readonly T[],
  availableSet: readonly string[],
): string[] {
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
