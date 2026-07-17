import type { StopCondition } from 'ai'
import { UPDATE_TODOS_ALL_DONE_MESSAGE } from '@shared/agent/todos'

export { UPDATE_TODOS_ALL_DONE_MESSAGE }

type ToolCallLike = { toolName?: string }
type ToolResultLike = { toolName?: string; output?: unknown }

/**
 * True when a tool output says the task list is fully done.
 * Only trusts `summary.allDone` or the explicit allDone stop message — not
 * generic `alreadySucceeded` stubs (those also appear for pending-list syncs
 * during explore/plan).
 */
export function toolOutputIndicatesTodosAllDone(output: unknown): boolean {
  if (output == null || typeof output !== 'object') return false
  const r = output as Record<string, unknown>
  const summary = r.summary
  if (
    summary != null &&
    typeof summary === 'object' &&
    (summary as { allDone?: unknown }).allDone === true
  ) {
    return true
  }
  if (
    typeof r.message === 'string' &&
    r.message.includes('allDone=true')
  ) {
    return true
  }
  return false
}

function stepIsUpdateTodosAllDoneOnly(step: {
  toolCalls?: ReadonlyArray<ToolCallLike>
  toolResults?: ReadonlyArray<ToolResultLike>
}): boolean {
  const calls = step.toolCalls ?? []
  if (calls.length === 0) return false
  if (!calls.every((c) => c.toolName === 'update_todos')) return false
  const results = step.toolResults ?? []
  return results.some(
    (r) =>
      r.toolName === 'update_todos' &&
      toolOutputIndicatesTodosAllDone(r.output),
  )
}

/**
 * Break dead loops where the model keeps calling only `update_todos` after the
 * checklist is already complete.
 *
 * Requires two consecutive update_todos-only allDone steps so explore/plan
 * (writing the first todo list) and a single completion sync can still continue.
 */
export function updateTodosAllDoneSpinStopWhen(): StopCondition<any> {
  return ({ steps }) => {
    if (steps.length < 2) return false
    const last = steps[steps.length - 1]!
    const prev = steps[steps.length - 2]!
    return (
      stepIsUpdateTodosAllDoneOnly(last) && stepIsUpdateTodosAllDoneOnly(prev)
    )
  }
}
