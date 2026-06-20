/** Values copied from planning JSON schema examples — not real task content. */
const KNOWN_PLANNING_PLACEHOLDER_PHRASES = new Set(
  [
    'short task name',
    'detailed description of what to do',
    'how to verify this task succeeded',
    'what to do if this task fails',
    'single clear sentence describing the desired end state',
    'document name',
    'sandbox-relative path under skills/, absolute path',
    'path or https URL to the script file',
    'optional; must exactly match a reference_doc basename when this step needs extra fields via ui form before tools run',
  ].map((s) => s.toLowerCase()),
)

/** True when the string is an unfilled planning-schema placeholder (e.g. `<short task name>`). */
export function isPlanningTemplatePlaceholder(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const inner = trimmed.replace(/^<|>$/g, '').trim()
  const key = inner.toLowerCase()
  if (KNOWN_PLANNING_PLACEHOLDER_PHRASES.has(key)) return true
  if (/^<[^>]+>$/.test(trimmed)) return true
  return false
}

/** Drops template placeholders; returns trimmed text otherwise. */
export function sanitizePlanningField(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed || isPlanningTemplatePlaceholder(trimmed)) return ''
  return trimmed
}

export function pickTodoPlanningFields(obj: Record<string, unknown>): {
  name: string
  description: string
  success_criteria: string
} {
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const raw = obj[key]
      if (typeof raw === 'string') {
        const sanitized = sanitizePlanningField(raw)
        if (sanitized) return sanitized
      }
    }
    return ''
  }
  return {
    name: pick('name', 'task', 'title'),
    description: pick('description', 'details', 'objective', 'goal'),
    success_criteria: pick(
      'success_criteria',
      'successCriteria',
      'criteria',
      'acceptance_criteria',
    ),
  }
}

export type TodoGoalFormatOptions = {
  finalGoal?: string
  todoId?: number
}

/** Minimal script ref on a planned todo row. */
export type PlannedTodoReferenceScript = {
  script_type?: string
  reference_url?: string
}

/** Minimal todo shape for resolving against a planning list. */
export type PlannedTodoLike = {
  id?: number
  name?: string
  description?: string
  success_criteria?: string
  reference_scripts?: PlannedTodoReferenceScript[]
}

export type PlanningTodoListSource = {
  finalGoal?: string
  todoList?: PlannedTodoLike[]
}

/**
 * Returns the todo row from {@link PlanningResult.todoList} for execution prompts.
 * Prefers list index (batch loop position), then id match, then the passed item.
 */
export function resolvePlannedTodoItem(
  plan: PlanningTodoListSource | undefined,
  todoItem: PlannedTodoLike,
  todoIndexInPlan?: number,
): PlannedTodoLike {
  const list = plan?.todoList
  if (!list?.length) return todoItem

  if (
    todoIndexInPlan != null &&
    todoIndexInPlan >= 0 &&
    todoIndexInPlan < list.length
  ) {
    const atIndex = list[todoIndexInPlan]
    if (atIndex) {
      if (
        todoItem.id == null ||
        atIndex.id == null ||
        atIndex.id === todoItem.id
      ) {
        return atIndex
      }
    }
  }

  if (todoItem.id != null) {
    const byId = list.find((t) => t.id === todoItem.id)
    if (byId) return byId
  }

  return todoItem
}

/** Scripts explicitly attached on the resolved planning todo row. */
export function resolveTodoReferenceScripts(
  plan: PlanningTodoListSource | undefined,
  todoItem: PlannedTodoLike,
  todoIndexInPlan?: number,
): PlannedTodoReferenceScript[] {
  const planned = resolvePlannedTodoItem(plan, todoItem, todoIndexInPlan)
  return (planned.reference_scripts ?? []).filter(
    (s) => (s.reference_url ?? '').trim().length > 0,
  )
}

