/**
 * Process-local binding for the plan step currently running in a foreach
 * tool loop. `update_todos` reads this during `plan_tool_execute` so status
 * changes are pinned to that step only.
 *
 * Foreach runs todos sequentially in this process, so a single slot is enough.
 */

let activePlanTodoContent: string | undefined

export function setActivePlanTodoContent(content: string | undefined): void {
  const trimmed = content?.trim()
  activePlanTodoContent = trimmed || undefined
}

export function getActivePlanTodoContent(): string | undefined {
  return activePlanTodoContent
}

export function clearActivePlanTodoContent(): void {
  activePlanTodoContent = undefined
}

/** @internal Test helper */
export function resetActivePlanTodoContentForTests(): void {
  activePlanTodoContent = undefined
}
