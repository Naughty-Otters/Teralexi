import { PLAN_FILE_WRITE_TOOLS } from '@toolSet/planning'
import { extractFileToolPaths } from '@toolSet/file-system/permission-keys'
import {
  isCanonicalPlanMarkdownPath,
  isPlanModeActive,
  planModeStorageOptionsFromEnv,
  resolvePlanModeStorage,
} from './plan-mode-state'
import { isPlanModeAllowedToolName } from './plan-mode-active-tools'

type GatedToolSpec = {
  execute?: (input: unknown) => Promise<unknown>
}

function isRootRun(depth: number | undefined): boolean {
  return depth === undefined || depth === 0
}

function planFileWriteAllowed(
  toolName: string,
  input: unknown,
  conversationId: string,
): boolean {
  if (!PLAN_FILE_WRITE_TOOLS.has(toolName)) return false
  const storage = resolvePlanModeStorage(
    conversationId,
    planModeStorageOptionsFromEnv(conversationId),
  )
  if (!storage) return false

  const paths = extractFileToolPaths(
    toolName,
    (input ?? {}) as Record<string, unknown>,
  )

  return (
    paths.length > 0 &&
    paths.every((p) => isCanonicalPlanMarkdownPath(storage, p))
  )
}

/**
 * Re-check plan mode on every tool execute so enter_plan_mode mid-stream takes effect
 * before the next tool call (belt-and-suspenders with prepareStep activeTools).
 */
export function applyRuntimePlanModeGate(
  toolSet: Record<string, GatedToolSpec>,
  conversationId: string | undefined,
  _skillId?: string | null,
  runDepth?: number,
): void {
  if (!isRootRun(runDepth)) return

  const id = conversationId?.trim()
  if (!id) return

  const root = isRootRun(runDepth)
  const allNames = Object.keys(toolSet)

  for (const name of allNames) {
    const spec = toolSet[name]
    if (!spec?.execute) continue

    const orig = spec.execute.bind(spec)
    spec.execute = async (input: unknown) => {
      if (!isPlanModeActive(id)) {
        return orig(input)
      }

      if (!isPlanModeAllowedToolName(name, root)) {
        return {
          error:
            'Explore mode is active: only read-only tools and plan-file edits are allowed until exit_plan_mode is approved.',
        }
      }

      if (PLAN_FILE_WRITE_TOOLS.has(name) && !planFileWriteAllowed(name, input, id)) {
        const storage = resolvePlanModeStorage(
          id,
          planModeStorageOptionsFromEnv(id),
        )
        return {
          error: `Explore mode: only the active plan file (${storage?.planFile.displayPath ?? 'plans/<slug>.md'}) may be edited — use update_todos to sync steps.`,
        }
      }

      return orig(input)
    }
  }
}
