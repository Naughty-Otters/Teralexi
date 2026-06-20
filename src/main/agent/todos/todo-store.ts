import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from '@main/logger'
import {
  emptyTodoList,
  parseTodoList,
  seedTodoListFromTitles,
  todosFileName,
  type TodoList,
} from '@shared/agent/todos'

const log = createLogger('agent.todos.store')

export function todosPath(sandboxRoot: string, namespace = 'main'): string {
  return join(sandboxRoot, todosFileName(namespace))
}

/** Read the task list for a sandbox + run namespace, or an empty list when absent. */
export function readTodoList(sandboxRoot: string, namespace = 'main'): TodoList {
  const file = todosPath(sandboxRoot, namespace)
  if (!existsSync(file)) return emptyTodoList()
  try {
    return parseTodoList(JSON.parse(readFileSync(file, 'utf8')))
  } catch (err) {
    log.warn('Failed to read todos file; treating as empty', { file, err })
    return emptyTodoList()
  }
}

/** Persist a task list. Best-effort; never throws. */
export function writeTodoList(
  sandboxRoot: string,
  list: TodoList,
  namespace = 'main',
): void {
  const file = todosPath(sandboxRoot, namespace)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(list, null, 2), 'utf8')
  } catch (err) {
    log.warn('Failed to write todos file', { file, err })
  }
}

/**
 * Seed (reset) the task list from the planning step's todo titles.
 *
 * Called only from `afterPlanning`, which runs on a FRESH planning pass — never
 * on HITL resume (resume jumps straight to the tool-loop stage). So overwriting
 * here gives each new task a clean list without wiping a paused run's progress.
 * Namespacing keeps a sub-agent's reset from clobbering the parent's list.
 */
export function seedTodosFromPlanning(
  sandboxRoot: string,
  todoTitles: string[],
  namespace = 'main',
): TodoList {
  const seeded = seedTodoListFromTitles(todoTitles)
  if (seeded.todos.length > 0) writeTodoList(sandboxRoot, seeded, namespace)
  return seeded
}
