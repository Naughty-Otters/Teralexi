import { writeFileSync } from 'node:fs'
import type { TodoList } from '@shared/agent/todos'
import { replaceTodos } from '@shared/agent/todos'
import {
  planModeStorageOptionsFromEnv,
  pruneStalePlanMarkdownFiles,
  resolvePlanModeStorage,
  writePlanModeTodoList,
} from '@main/agent/coding/plan-mode-storage-impl'
import {
  planContextFromTodoList,
  renderPlanModeMarkdown,
  renderPlanMarkdownFromTodoList,
} from '@main/agent/coding/plan-mode-template'

/** @deprecated Use {@link renderPlanModeMarkdown} via writePlanModeTodoList. */
export function renderPlanMarkdownFromSteps(
  steps: string[],
  options?: { overview?: string },
): string {
  const list = replaceTodos(steps.map((content) => ({ content, status: 'pending' })))
  return renderPlanModeMarkdown(planContextFromTodoList(list))
}

/** Mirror todo titles into the co-located plan markdown file. */
export function syncPlanFileFromTodoContents(
  conversationId: string,
  todos: Array<{ content?: string; status?: string }>,
): { ok: boolean; planFilePath?: string; error?: string } {
  const items = todos
    .map((todo) => ({
      content: typeof todo.content === 'string' ? todo.content.trim() : '',
      status: todo.status ?? 'pending',
    }))
    .filter((todo) => todo.content.length > 0)
  if (items.length === 0) {
    return { ok: false, error: 'No todo steps to sync to the plan file.' }
  }

  const storageOptions = planModeStorageOptionsFromEnv(conversationId)
  const storage = resolvePlanModeStorage(conversationId, storageOptions)
  if (!storage) {
    return { ok: false, error: 'No plan storage for this conversation.' }
  }

  const list = replaceTodos(items)
  writePlanModeTodoList(conversationId, list, storageOptions)
  return { ok: true, planFilePath: storage.planFile.displayPath }
}

export function syncPlanMarkdownFromTodos(
  conversationId: string,
  list: TodoList,
): { ok: boolean; planFilePath?: string; error?: string } {
  const storageOptions = planModeStorageOptionsFromEnv(conversationId)
  const storage = resolvePlanModeStorage(conversationId, storageOptions)
  if (!storage) {
    return { ok: false, error: 'No plan storage for this conversation.' }
  }
  pruneStalePlanMarkdownFiles(storage.plansDirAbs, storage.planFile.absolutePath)
  const markdown = renderPlanMarkdownFromTodoList(list)
  writeFileSync(storage.planFile.absolutePath, markdown, 'utf8')
  return { ok: true, planFilePath: storage.planFile.displayPath }
}

type TodoToolSpec = {
  execute?: (input: unknown) => Promise<unknown>
}

/**
 * @deprecated Plan markdown is synced inside writePlanModeTodoList; kept as a no-op shim.
 */
export function wrapPlanModeTodoToolExecutes(
  _toolSet: Record<string, TodoToolSpec>,
  _conversationId: string | undefined,
): void {}
