/**
 * Default max tool-loop steps for a general tool-bearing agent.
 *
 * The loop terminates naturally when the model returns a final answer with no
 * tool call, so this is only a safety ceiling. Most non-coding skills finish in
 * 1–3 steps; a larger default mainly helps multi-step tasks avoid silent
 * truncation. (Was 5 — far too small for any real coding task.)
 */
export const DEFAULT_TOOL_LOOP_MAX_ITERATIONS = 25

/**
 * Coding-tier budget for skills that read → edit → run tests → fix in a single
 * loop (e.g. the `coding` and `code-review` skills). A real multi-file change
 * easily needs 30–60 tool calls; opencode runs effectively unbounded.
 */
export const CODING_TOOL_LOOP_MAX_ITERATIONS = 50

export const MIN_TOOL_LOOP_MAX_ITERATIONS = 1

/** Hard ceiling. Raised 10 → 100 so per-skill coding budgets aren't clamped away. */
export const MAX_TOOL_LOOP_MAX_ITERATIONS = 100

export function clampToolLoopMaxIterations(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TOOL_LOOP_MAX_ITERATIONS
  }
  return Math.max(
    MIN_TOOL_LOOP_MAX_ITERATIONS,
    Math.min(MAX_TOOL_LOOP_MAX_ITERATIONS, Math.floor(value)),
  )
}

/** Resolves configured max iterations; uses {@link DEFAULT_TOOL_LOOP_MAX_ITERATIONS} when unset. */
export function resolveToolLoopMaxIterations(
  value: number | undefined | null,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampToolLoopMaxIterations(value)
  }
  return DEFAULT_TOOL_LOOP_MAX_ITERATIONS
}

/** Default full todo re-attempts when a planned todo's `fallback_plan` is `retry`. */
export const DEFAULT_TODO_MAX_RETRIES = 3

export const MIN_TODO_MAX_RETRIES = 1

export const MAX_TODO_MAX_RETRIES = 10

export function clampTodoMaxRetries(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TODO_MAX_RETRIES
  }
  return Math.max(
    MIN_TODO_MAX_RETRIES,
    Math.min(MAX_TODO_MAX_RETRIES, Math.floor(value)),
  )
}

export function resolveTodoMaxRetries(value: number | undefined | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampTodoMaxRetries(value)
  }
  return DEFAULT_TODO_MAX_RETRIES
}
