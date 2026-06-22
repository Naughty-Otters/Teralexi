import type { AgentFlowContext, AgentStepContext } from '../context'
import type { TodoItem } from '../types'
import { latestThinkingStepData } from '../expr/thinking-utils'
import { markPlanExecutionCompleted } from './plan-mode-session-reminders'
import {
  isPlanExecutionActive,
  planModeFor,
} from './plan-mode-state'
import {
  clearPlanModeTodoArtifacts,
  planModeStorageOptionsFromEnv,
  readPlanModeTodoList,
  writePlanModeTodoList,
  type PlanModeStorageOptions,
} from './plan-mode-storage-impl'
import {
  replaceTodos,
  summarizeTodos,
  type TrackedTodo,
  type TrackedTodoStatus,
  type TodoList,
} from '@shared/agent/todos'

function mapTrackedStatusToPipeline(
  status: TrackedTodoStatus,
): TodoItem['status'] {
  if (status === 'in_progress') return 'in-progress'
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'failed'
  return 'pending'
}

function mapPipelineStatusToTracked(
  status: TodoItem['status'],
): TrackedTodoStatus {
  if (status === 'in-progress') return 'in_progress'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'cancelled'
  return 'pending'
}

const DEFAULT_SUCCESS_CRITERIA = 'Task completed successfully.'

export function trackedTodosToTodoItems(todos: TrackedTodo[]): TodoItem[] {
  return todos.map((todo, index) => ({
    id: index + 1,
    name: todo.content,
    description: todo.content,
    success_criteria: todo.success_criteria?.trim() || DEFAULT_SUCCESS_CRITERIA,
    fallback_plan: todo.fallback_plan ?? 'retry',
    status: mapTrackedStatusToPipeline(todo.status),
    output: todo.status === 'completed' ? todo.content : undefined,
    ...(todo.verify_command?.trim()
      ? { verify_command: todo.verify_command.trim() }
      : {}),
  }))
}

export function todoItemsToTrackedTodos(items: TodoItem[]): TrackedTodo[] {
  return items.map((item, index) => {
    const tracked: TrackedTodo = {
      id: `t${index + 1}`,
      content: item.name?.trim() || item.description?.trim() || `Task ${index + 1}`,
      status: mapPipelineStatusToTracked(item.status),
    }
    const success_criteria = item.success_criteria?.trim()
    if (
      success_criteria &&
      success_criteria !== DEFAULT_SUCCESS_CRITERIA
    ) {
      tracked.success_criteria = success_criteria
    }
    const verify_command = item.verify_command?.trim()
    if (verify_command) tracked.verify_command = verify_command
    if (item.fallback_plan && item.fallback_plan !== 'retry') {
      tracked.fallback_plan = item.fallback_plan
    }
    return tracked
  })
}

export function resolvePlanStorageOptionsForContext(
  ctx: AgentFlowContext | AgentStepContext,
): PlanModeStorageOptions {
  const sandboxRoot = ctx.sandbox?.getRoot?.()?.trim()
  const conversationId = ctx.opts.conversationId?.trim()
  if (sandboxRoot) return { sandboxRoot }
  return planModeStorageOptionsFromEnv(conversationId)
}

function planStorageOptions(
  ctx: AgentFlowContext | AgentStepContext,
): PlanModeStorageOptions {
  return resolvePlanStorageOptionsForContext(ctx)
}

export function readPlanModeTodoListForConversation(
  conversationId: string,
  options?: PlanModeStorageOptions,
): TodoList {
  return readPlanModeTodoList(conversationId, options)
}

/** True when `plans/todos.json` exists and has at least one task row. */
export function hasPersistedPlanTodos(
  conversationId: string | undefined,
  options?: PlanModeStorageOptions,
): boolean {
  const id = conversationId?.trim()
  if (!id) return false
  const list = readPlanModeTodoList(
    id,
    options ?? planModeStorageOptionsFromEnv(id),
  )
  return list.todos.length > 0
}

/**
 * When all todos on disk are done but persisted status is still `plan_tool_execute`,
 * return to normal tool_execute so the foreach/tool-loop gates stay consistent.
 */
export function reconcilePlanExecutionStateFromDisk(
  ctx: AgentFlowContext | AgentStepContext,
): void {
  clearPlanExecutionIfAllDone(
    ctx.opts.conversationId,
    planStorageOptions(ctx),
  )
}

export function shouldRunPlanTodoForeach(ctx: AgentFlowContext): boolean {
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId) return false
  reconcilePlanExecutionStateFromDisk(ctx)
  if (!isPlanExecutionActive(conversationId)) return false
  const list = readPlanModeTodoList(
    conversationId,
    planStorageOptions(ctx),
  )
  return list.todos.length > 0 && !summarizeTodos(list).allDone
}

function fallbackTitlesFromUserInput(ctx: AgentFlowContext): string[] {
  const thinking = latestThinkingStepData(ctx)
  const fromThinking =
    thinking?.task?.trim() || thinking?.goal?.trim() || ''
  if (fromThinking) return [fromThinking]

  const messages = Array.isArray(ctx.currentMessages) ? ctx.currentMessages : []
  const lastUser = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && typeof m.content === 'string')
  const text = lastUser?.content?.trim()
  return text ? [text] : []
}

export function planModeTodoItemsFromContext(
  ctx: AgentFlowContext | AgentStepContext,
): TodoItem[] {
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId) return []

  const list = readPlanModeTodoList(conversationId, planStorageOptions(ctx))
  if (list.todos.length > 0) {
    return trackedTodosToTodoItems(list.todos)
  }

  const titles = fallbackTitlesFromUserInput(ctx)
  if (titles.length === 0) return []
  return trackedTodosToTodoItems(
    replaceTodos(titles.map((content) => ({ content, status: 'pending' }))).todos,
  )
}

export function persistPlanModeTodosFromPipeline(
  ctx: AgentStepContext,
  items: TodoItem[],
): void {
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId) return
  const list = replaceTodos(todoItemsToTrackedTodos(items))
  writePlanModeTodoList(conversationId, list, planStorageOptions(ctx))
}

export function clearPlanExecutionIfAllDone(
  conversationId: string | undefined,
  options?: PlanModeStorageOptions,
): void {
  const id = conversationId?.trim()
  if (!id) return
  if (!isPlanExecutionActive(conversationId)) return
  const list = readPlanModeTodoList(
    id,
    options ?? planModeStorageOptionsFromEnv(id),
  )
  if (!summarizeTodos(list).allDone) return
  const storageOptions = options ?? planModeStorageOptionsFromEnv(id)
  planModeFor(id).deactivateExecution({
    trigger: 'execution:all_todos_done',
  })
  markPlanExecutionCompleted(id)
  clearPlanModeTodoArtifacts(id, storageOptions)
}

export function shouldSkipPlanModeTodoItem(item: unknown): boolean {
  const todo = item as TodoItem
  return todo.status === 'completed' || todo.status === 'failed'
}

export function isPlanModeTodosAllDoneOnDisk(
  ctx: AgentFlowContext | AgentStepContext,
): boolean {
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId) return false
  const list = readPlanModeTodoList(conversationId, planStorageOptions(ctx))
  return list.todos.length > 0 && summarizeTodos(list).allDone
}

/** Align in-memory foreach todos with the on-disk plan list (statuses and new rows). */
export function syncPlanModeBatchTodosFromDisk(
  ctx: AgentFlowContext | AgentStepContext,
  items: TodoItem[],
): void {
  const disk = planModeTodoItemsFromContext(ctx)
  if (disk.length !== items.length) {
    items.splice(0, items.length, ...disk)
    return
  }
  const n = Math.min(items.length, disk.length)
  for (let i = 0; i < n; i++) {
    const source = disk[i]
    const target = items[i]
    if (!source || !target) continue
    target.status = source.status
    if (source.output?.trim()) {
      target.output = source.output
    }
    if (source.success_criteria?.trim()) {
      target.success_criteria = source.success_criteria
    }
    if (source.verify_command?.trim()) {
      target.verify_command = source.verify_command
    }
  }
}
