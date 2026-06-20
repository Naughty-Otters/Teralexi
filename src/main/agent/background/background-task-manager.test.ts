import { describe, expect, it, beforeEach } from 'vitest'
import {
  appendBackgroundTaskOutput,
  cancelBackgroundTask,
  clearBackgroundTasksForTests,
  completeBackgroundTask,
  createBackgroundTask,
  getBackgroundTask,
  listBackgroundTasks,
} from './background-task-manager'

describe('background-task-manager', () => {
  beforeEach(() => {
    clearBackgroundTasksForTests()
  })

  it('creates and completes tasks', () => {
    const task = createBackgroundTask({
      kind: 'subagent',
      label: 'Explore auth',
      conversationId: 'conv-1',
    })
    expect(task.status).toBe('running')
    appendBackgroundTaskOutput(task.id, 'found files')
    completeBackgroundTask(task.id, 'completed')
    const stored = getBackgroundTask(task.id)
    expect(stored?.status).toBe('completed')
    expect(stored?.output).toContain('found files')
  })

  it('lists tasks filtered by conversation', () => {
    createBackgroundTask({ kind: 'shell', label: 'a', conversationId: 'c1' })
    createBackgroundTask({ kind: 'shell', label: 'b', conversationId: 'c2' })
    expect(listBackgroundTasks('c1')).toHaveLength(1)
    expect(listBackgroundTasks()).toHaveLength(2)
  })

  it('cancels running tasks without shell handle', () => {
    const task = createBackgroundTask({ kind: 'subagent', label: 'x' })
    expect(cancelBackgroundTask(task.id)).toBe(true)
    expect(getBackgroundTask(task.id)?.status).toBe('cancelled')
  })
})
