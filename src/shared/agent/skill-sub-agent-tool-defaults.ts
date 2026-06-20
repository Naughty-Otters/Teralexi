/** Tag applied to sub-agent delegation tools in the global toolSet catalog. */
const SUB_AGENT_TOOL_TAGS = ['sub-agents'] as const

function toolNamesMatchingTags<
  T extends { name: string; tags?: readonly string[] },
>(catalogTools: readonly T[], tags: readonly string[]): string[] {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()))
  return catalogTools
    .filter((tool) =>
      (tool.tags ?? []).some((tag) => tagSet.has(tag.toLowerCase())),
    )
    .map((tool) => tool.name)
}

/** Union sub-agent delegation tools into the skill's enabled set (all skills by default). */
export function expandSkillSubAgentAvailableSet<
  T extends { name: string; tags?: readonly string[] },
>(catalogTools: readonly T[], availableSet: readonly string[]): string[] {
  const subAgentNames = toolNamesMatchingTags(catalogTools, SUB_AGENT_TOOL_TAGS)
  return [...new Set([...availableSet, ...subAgentNames])]
}

/** Default `toolNeedsApprovalOverrides` — false = run without HITL for sub-agent tools. */
export function resolveSkillSubAgentApprovalOverrides<
  T extends { name: string; tags?: readonly string[] },
>(
  catalogTools: readonly T[],
  enabledToolNames: readonly string[],
): Record<string, boolean> {
  const enabled = new Set(enabledToolNames)
  const tags = new Set(SUB_AGENT_TOOL_TAGS.map((tag) => tag.toLowerCase()))
  const overrides: Record<string, boolean> = {}

  for (const tool of catalogTools) {
    if (!enabled.has(tool.name)) continue
    if (!(tool.tags ?? []).some((tag) => tags.has(tag.toLowerCase()))) continue
    overrides[tool.name] = false
  }

  return overrides
}

export function mergeSkillSubAgentApprovalOverrides<
  T extends { name: string; tags?: readonly string[] },
>(
  catalogTools: readonly T[],
  enabledToolNames: readonly string[],
  savedOverrides: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const saved = savedOverrides ?? {}
  const defaults = resolveSkillSubAgentApprovalOverrides(
    catalogTools,
    enabledToolNames,
  )
  return { ...defaults, ...saved }
}
