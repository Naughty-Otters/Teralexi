import { isPlanModeActive } from './plan-mode-state'

/**
 * While explore (`planning`) is active, todos describe the draft plan — not finished work.
 * `completed` is only valid during approved execution (`plan_tool_execute`).
 */
export function explorePhaseTodoUpdateBlockedReason(
  conversationId: string | undefined,
  todos: readonly { status?: unknown }[],
): string | null {
  const id = conversationId?.trim()
  if (!id || !isPlanModeActive(id)) return null

  const hasCompleted = todos.some((todo) => todo.status === 'completed')
  if (!hasCompleted) return null

  return (
    'Exploring: keep todos pending or in_progress while drafting the plan. ' +
    'Mark tasks completed only after exit_plan_mode is approved and execution begins. ' +
    'Call exit_plan_mode when the plan is ready for approval.'
  )
}
