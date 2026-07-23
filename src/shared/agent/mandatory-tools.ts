/** Tools that are always enabled for every skill and cannot be disabled in agent settings. */
export const MANDATORY_TOOL_NAMES = new Set<string>([
  'read_todos',
  'update_todos',
  'enter_plan_mode',
  'exit_plan_mode',
  'invoke_agents',
  'promote_artifact',
  'generate_follow_up',
  'edit_files',
  'shell',
])

/** Mandatory tools that still require HITL approval unless the user disables it. */
export const APPROVAL_REQUIRED_BY_DEFAULT_TOOL_NAMES = new Set<string>([
  'edit_files',
  'shell',
])

export function isMandatoryTool(toolName: string): boolean {
  return MANDATORY_TOOL_NAMES.has(toolName)
}

export function isApprovalRequiredByDefault(toolName: string): boolean {
  return APPROVAL_REQUIRED_BY_DEFAULT_TOOL_NAMES.has(toolName)
}

/** Merge mandatory tool names that exist in the catalog into a name list. */
export function withMandatoryToolsInCatalog<T extends { name: string }>(
  catalogTools: readonly T[],
  names: readonly string[],
): string[] {
  const catalogNames = new Set(catalogTools.map((tool) => tool.name))
  const merged = new Set(names)
  for (const name of MANDATORY_TOOL_NAMES) {
    if (catalogNames.has(name)) merged.add(name)
  }
  return [...merged]
}
