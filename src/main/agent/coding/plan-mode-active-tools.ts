import {
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  PLAN_MODE_FILE_IO_TOOLS,
  PLAN_MODE_GIT_READ_TOOLS,
  PLAN_MODE_RESEARCH_TOOLS,
} from '@toolSet/planning'
import { isPlanModeActive } from './plan-mode-state'

/** Read-only research tools allowed while agent explore mode is active. */
const PLAN_MODE_READ_TOOLS = new Set([
  ...PLAN_MODE_FILE_IO_TOOLS,
  ...PLAN_MODE_RESEARCH_TOOLS,
  ...PLAN_MODE_GIT_READ_TOOLS,
  'read_todos',
])

const PLAN_MODE_WRITE_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch'])

const PLAN_MODE_TASK_TOOLS = new Set(['update_todos'])

/**
 * Strict plan-mode allowlist — no scripts, shell, workspace commands, or sub-agents.
 * Planning is read-only exploration plus plan-file / todo updates only.
 */
export const PLAN_MODE_ALLOWED_TOOL_NAMES = new Set([
  ...PLAN_MODE_READ_TOOLS,
  ...PLAN_MODE_WRITE_TOOLS,
  ...PLAN_MODE_TASK_TOOLS,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
])

/** Tool names allowed on a prepareStep while agent explore mode is active. */
export function resolvePlanModeActiveToolNames(
  allToolNames: readonly string[],
  isRootRun: boolean,
  conversationId: string | undefined,
): string[] {
  if (!isPlanModeActive(conversationId)) return [...allToolNames]

  const allowed = new Set<string>(PLAN_MODE_READ_TOOLS)
  for (const name of PLAN_MODE_WRITE_TOOLS) allowed.add(name)
  for (const name of PLAN_MODE_TASK_TOOLS) allowed.add(name)
  if (isRootRun) {
    allowed.add(ENTER_PLAN_MODE_TOOL_NAME)
    allowed.add(EXIT_PLAN_MODE_TOOL_NAME)
  }

  return allToolNames.filter((name) => allowed.has(name))
}

export function isPlanModeAllowedToolName(
  toolName: string,
  isRootRun: boolean,
): boolean {
  if (PLAN_MODE_ALLOWED_TOOL_NAMES.has(toolName)) {
    if (
      !isRootRun &&
      (toolName === ENTER_PLAN_MODE_TOOL_NAME ||
        toolName === EXIT_PLAN_MODE_TOOL_NAME)
    ) {
      return false
    }
    return true
  }
  return false
}
