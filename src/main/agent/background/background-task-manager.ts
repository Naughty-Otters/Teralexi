import { randomUUID } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'

export type BackgroundTaskKind = 'subagent' | 'shell'

export type BackgroundTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type BackgroundTask = {
  id: string
  kind: BackgroundTaskKind
  label: string
  status: BackgroundTaskStatus
  startedAt: string
  endedAt?: string
  output: string
  error?: string
  conversationId?: string
}

type ShellTaskHandle = {
  task: BackgroundTask
  process: ChildProcess
}

const tasks = new Map<string, BackgroundTask>()
const shellHandles = new Map<string, ShellTaskHandle>()

function appendOutput(id: string, chunk: string): void {
  const t = tasks.get(id)
  if (!t) return
  t.output = (t.output + chunk).slice(-200_000)
}

export function createBackgroundTask(args: {
  kind: BackgroundTaskKind
  label: string
  conversationId?: string
}): BackgroundTask {
  const task: BackgroundTask = {
    id: randomUUID(),
    kind: args.kind,
    label: args.label,
    status: 'running',
    startedAt: new Date().toISOString(),
    output: '',
    conversationId: args.conversationId,
  }
  tasks.set(task.id, task)
  return task
}

export function completeBackgroundTask(
  id: string,
  status: 'completed' | 'failed' | 'cancelled',
  error?: string,
): BackgroundTask | null {
  const t = tasks.get(id)
  if (!t) return null
  t.status = status
  t.endedAt = new Date().toISOString()
  if (error) t.error = error
  shellHandles.delete(id)
  return t
}

export function appendBackgroundTaskOutput(id: string, chunk: string): void {
  appendOutput(id, chunk)
}

export function registerShellTask(
  task: BackgroundTask,
  process: ChildProcess,
): void {
  shellHandles.set(task.id, { task, process })
  process.stdout?.on('data', (buf) => appendOutput(task.id, String(buf)))
  process.stderr?.on('data', (buf) => appendOutput(task.id, String(buf)))
}

export function cancelBackgroundTask(id: string): boolean {
  const handle = shellHandles.get(id)
  if (handle) {
    handle.process.kill('SIGTERM')
    completeBackgroundTask(id, 'cancelled')
    return true
  }
  const t = tasks.get(id)
  if (t?.status === 'running') {
    completeBackgroundTask(id, 'cancelled')
    return true
  }
  return false
}

export function listBackgroundTasks(conversationId?: string): BackgroundTask[] {
  const filter = conversationId?.trim()
  return [...tasks.values()]
    .filter((t) => !filter || t.conversationId === filter)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getBackgroundTask(id: string): BackgroundTask | null {
  return tasks.get(id) ?? null
}

/** @internal Test helper */
export function clearBackgroundTasksForTests(): void {
  tasks.clear()
  shellHandles.clear()
}
