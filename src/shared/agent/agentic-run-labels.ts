/** User-facing title for the tool-loop / agentic execution pipeline stage. */
export const AGENTIC_RUN_STEP_TITLE = 'Agentic Run' as const

/** End-user label for the live tool exploration panel in chat. */
export const EXPLORING_PANEL_TITLE = 'Exploring' as const

/** Persisted history and older streams may still use this title. */
export const LEGACY_TOOL_LOOP_STEP_TITLE = 'Tool Loop' as const

export function formatAgenticRunTaskStepTitle(
  todoId: number,
  attempt: number,
): string {
  return `${AGENTIC_RUN_STEP_TITLE} Task ${todoId} Attempt ${attempt}`
}

export function isAgenticRunParentStepTitle(title: string | undefined): boolean {
  const t = (title ?? '').trim()
  return t === AGENTIC_RUN_STEP_TITLE || t === LEGACY_TOOL_LOOP_STEP_TITLE
}

export function isAgenticRunPerTaskStepTitle(title: string | undefined): boolean {
  const t = (title ?? '').trim()
  return (
    new RegExp(`^${escapeRegExp(AGENTIC_RUN_STEP_TITLE)} Task \\d+`, 'i').test(
      t,
    ) || /^Tool Loop Task \d+/i.test(t)
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
