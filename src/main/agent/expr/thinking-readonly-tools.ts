import {
  PLAN_MODE_FILE_IO_TOOLS,
  PLAN_MODE_GIT_READ_TOOLS,
  PLAN_MODE_RESEARCH_TOOLS,
} from '@toolSet/planning'

/** Read-only tools allowed during the thinking research pass. */
export const THINKING_READONLY_TOOL_NAMES = new Set([
  ...PLAN_MODE_FILE_IO_TOOLS,
  ...PLAN_MODE_RESEARCH_TOOLS,
  ...PLAN_MODE_GIT_READ_TOOLS,
])

export function resolveThinkingReadonlyToolNames(
  allToolNames: readonly string[],
): string[] {
  return allToolNames.filter((name) => THINKING_READONLY_TOOL_NAMES.has(name))
}

export function applyThinkingReadonlyPolicy(
  toolSet: Record<string, unknown>,
): void {
  for (const name of Object.keys(toolSet)) {
    if (!THINKING_READONLY_TOOL_NAMES.has(name)) {
      delete toolSet[name]
    }
  }
}

export function thinkingReadonlyToolsAvailable(
  allToolNames: readonly string[],
): boolean {
  return resolveThinkingReadonlyToolNames(allToolNames).length > 0
}
