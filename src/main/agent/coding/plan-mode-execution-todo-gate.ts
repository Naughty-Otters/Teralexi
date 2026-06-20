import type { PlanModeStorageOptions } from './plan-mode-state'
import { enterPlanModeBlockedReason } from './plan-mode-enter-guard'

type GatedToolSpec = {
  execute?: (input: unknown) => Promise<unknown>
}

const BLOCKED_TOOLS = new Set(['enter_plan_mode'])

/**
 * Block re-entering explore/plan mode while a plan is active, executing, or
 * already persisted on disk. `update_todos` and `exit_plan_mode` stay available.
 */
export function applyPlanExecutionTodoGate(
  toolSet: Record<string, GatedToolSpec>,
  conversationId: string | undefined,
  storageOptions?: PlanModeStorageOptions,
): void {
  const id = conversationId?.trim()
  if (!id) return

  for (const name of Object.keys(toolSet)) {
    if (!BLOCKED_TOOLS.has(name)) continue
    const spec = toolSet[name]
    if (!spec?.execute) continue

    const orig = spec.execute.bind(spec)
    spec.execute = async (input: unknown) => {
      const blocked = enterPlanModeBlockedReason(id, storageOptions)
      if (!blocked) {
        return orig(input)
      }
      return { error: blocked }
    }
  }
}
