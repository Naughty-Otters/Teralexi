/**
 * Dynamic task-tracking model, shared between main, the toolSet, and the renderer.
 *
 * The durable store is a JSON file in the agent sandbox (see
 * `@main/agent/todos`); these helpers are pure so they can be unit-tested and
 * imported from the renderer without Node APIs.
 */

export type TrackedTodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export const TRACKED_TODO_STATUSES: readonly TrackedTodoStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
] as const

export type TrackedTodoFallbackPlan =
  | 'retry'
  | 'skip'
  | 'manual_intervention'

export const TRACKED_TODO_FALLBACK_PLANS: readonly TrackedTodoFallbackPlan[] = [
  'retry',
  'skip',
  'manual_intervention',
] as const

export type TrackedTodo = {
  id: string
  content: string
  status: TrackedTodoStatus
  success_criteria?: string
  verify_command?: string
  fallback_plan?: TrackedTodoFallbackPlan
}

export type TrackedTodoInput = {
  id?: unknown
  content?: unknown
  status?: unknown
  success_criteria?: unknown
  verify_command?: unknown
  fallback_plan?: unknown
}

export type TodoList = {
  version: 1
  updatedAt: string
  todos: TrackedTodo[]
}

export function isTrackedTodoStatus(value: unknown): value is TrackedTodoStatus {
  return (
    typeof value === 'string' &&
    (TRACKED_TODO_STATUSES as readonly string[]).includes(value)
  )
}

/**
 * Derive a per-run todo namespace from the sandbox output scope.
 *
 * The sandbox is shared per-conversation, but each agent run (and each
 * sub-agent) must own a distinct task list — otherwise a new message would see
 * the previous task's todos, and a sub-agent's full-replace `update_todos`
 * would clobber the parent's list. Sub-runs carry `output/subRuns/<runId>` in
 * their scope; the top-level run does not. We key off the deepest subRuns id.
 */
export function todosNamespaceFromScope(
  outputScope: string | null | undefined,
): string {
  const normalized = (outputScope ?? '').replace(/\\/g, '/')
  const matches = [...normalized.matchAll(/subRuns\/([^/]+)/g)]
  if (matches.length === 0) return 'main'
  const id = matches[matches.length - 1]![1]!.replace(/[^A-Za-z0-9_-]/g, '')
  return id ? `sub-${id}` : 'main'
}

/** File name for a namespace. The top-level run keeps the plain `todos.json`. */
export function todosFileName(namespace: string): string {
  return namespace === 'main' ? 'todos.json' : `todos.${namespace}.json`
}

export function emptyTodoList(now: string = new Date().toISOString()): TodoList {
  return { version: 1, updatedAt: now, todos: [] }
}

/** Sequential id for the nth todo (1-based). Stable for a fixed order. */
function todoId(index: number): string {
  return `t${index + 1}`
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function isTrackedTodoFallbackPlan(
  value: unknown,
): value is TrackedTodoFallbackPlan {
  return (
    typeof value === 'string' &&
    (TRACKED_TODO_FALLBACK_PLANS as readonly string[]).includes(value)
  )
}

/**
 * Normalize loosely-typed todo input (from the tool or a parsed file) into a
 * clean ordered list with sequential ids and valid statuses.
 */
export function normalizeTodos(input: TrackedTodoInput[]): TrackedTodo[] {
  const todos: TrackedTodo[] = []
  for (const raw of input) {
    const content = typeof raw.content === 'string' ? raw.content.trim() : ''
    if (!content) continue
    const status = isTrackedTodoStatus(raw.status) ? raw.status : 'pending'
    const success_criteria = trimOptionalString(raw.success_criteria)
    const verify_command = trimOptionalString(raw.verify_command)
    const fallback_plan = isTrackedTodoFallbackPlan(raw.fallback_plan)
      ? raw.fallback_plan
      : undefined
    todos.push({
      id: todoId(todos.length),
      content,
      status,
      ...(success_criteria ? { success_criteria } : {}),
      ...(verify_command ? { verify_command } : {}),
      ...(fallback_plan ? { fallback_plan } : {}),
    })
  }
  return todos
}

/** Build an initial list (all pending) from ordered task titles. */
export function seedTodoListFromTitles(
  titles: string[],
  now: string = new Date().toISOString(),
): TodoList {
  const todos = normalizeTodos(
    titles
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean)
      .map((content) => ({ content, status: 'pending' as const })),
  )
  return { version: 1, updatedAt: now, todos }
}

/** Full-replace semantics (the model always sends the complete current list). */
export function replaceTodos(
  incoming: TrackedTodoInput[],
  now: string = new Date().toISOString(),
): TodoList {
  return { version: 1, updatedAt: now, todos: normalizeTodos(incoming) }
}

/** Coerce arbitrary parsed JSON into a valid TodoList (defensive file read). */
export function parseTodoList(value: unknown): TodoList {
  if (!value || typeof value !== 'object') return emptyTodoList()
  const obj = value as Record<string, unknown>
  const todos = Array.isArray(obj.todos)
    ? normalizeTodos(obj.todos as Array<Record<string, unknown>>)
    : []
  const updatedAt =
    typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString()
  return { version: 1, updatedAt, todos }
}

export type TodoSummary = {
  total: number
  pending: number
  inProgress: number
  completed: number
  cancelled: number
  /** True when every non-cancelled todo is completed. */
  allDone: boolean
}

export function summarizeTodos(list: TodoList): TodoSummary {
  const s: TodoSummary = {
    total: list.todos.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    allDone: false,
  }
  for (const t of list.todos) {
    if (t.status === 'pending') s.pending++
    else if (t.status === 'in_progress') s.inProgress++
    else if (t.status === 'completed') s.completed++
    else if (t.status === 'cancelled') s.cancelled++
  }
  const actionable = s.total - s.cancelled
  s.allDone = actionable > 0 && s.completed === actionable
  return s
}

const STATUS_MARK: Record<TrackedTodoStatus, string> = {
  pending: '[ ]',
  in_progress: '[~]',
  completed: '[x]',
  cancelled: '[-]',
}

function formatTodoChecklistLine(todo: TrackedTodo): string {
  let line = `- ${STATUS_MARK[todo.status]} ${todo.content}`
  if (todo.success_criteria) {
    line += ` (verify: ${todo.success_criteria})`
  }
  if (todo.verify_command) {
    line += ` [cmd: ${todo.verify_command}]`
  }
  return line
}

/** Markdown checklist for the model-facing tool result and text rendering. */
export function renderTodoChecklist(list: TodoList): string {
  if (list.todos.length === 0) return '_No tasks._'
  return list.todos.map(formatTodoChecklistLine).join('\n')
}
