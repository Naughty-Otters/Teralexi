import type { AgentStepContext } from '../../context'
import { assessTodoFormReadiness } from '../../form/todo-form-readiness'
import type { PlanningResult, TodoItem } from '../../types'
import { resolvePlannedTodoItem } from '../../utils/planning-fields'

/** Resolve planner todo row for a batch index (shared by planned + expression paths). */
export function resolvePlannedTodoForIndex(
  planning: PlanningResult | undefined,
  item: unknown,
  index: number,
): TodoItem {
  const todoItem = item as TodoItem
  if (!planning) return todoItem
  return resolvePlannedTodoItem(planning, todoItem, index) as TodoItem
}

/**
 * Apply pending form responses and pause for HITL form collection when needed.
 * @returns true when execution must stop until the client submits the form.
 */
export async function runTodoItemPrelude(
  stepCtx: AgentStepContext,
  plannedTodo: TodoItem,
  todoIndexInPlan: number,
): Promise<boolean> {
  stepCtx.form.applyCollectFormResponsesToUiMessages()

  const existing = (stepCtx.collectedFormByTodoId ?? {})[plannedTodo.id]
  if (existing && Object.keys(existing).length > 0) {
    return false
  }

  const readiness = await assessTodoFormReadiness(stepCtx, {
    todoItem: plannedTodo,
    reference_doc: plannedTodo.reference_doc ?? [],
  })

  return stepCtx.form.maybePauseForFormBeforeTodoExecution(stepCtx, {
    todoItem: plannedTodo,
    reference_doc: plannedTodo.reference_doc ?? [],
    todoIndexInPlan,
    readiness,
  })
}
