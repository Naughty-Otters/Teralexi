import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import {
  planModeTodoItemsFromContext,
  reconcilePlanExecutionStateFromDisk,
  shouldRunPlanTodoForeach,
  runApprovedPlanTodoForeach,
  todoItemsToTrackedTodos,
  trackedTodosToTodoItems,
  isPlanModeTodosAllDoneOnDisk,
  syncPlanModeBatchTodosFromDisk,
} from './plan-mode-execution-bridge'
import {
  hasRecentPlanExecutionCompleted,
  resetAllPlanRemindersForTests,
} from './plan-mode-session-reminders'

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'plan_tool_execute',
    planSlug: 'implementation-plan',
  }
  return { planState }
})

vi.mock('@main/services/plan-mode-state-notify', () => ({
  notifyPlanModeStateChanged: vi.fn(),
}))

vi.mock('@main/agent/sandbox/run-context', () => ({
  getAgentRunSandboxRoot: vi.fn(() => null as string | null),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversationPlanModeState: vi.fn(() => ({ ...planState })),
    setConversationPlanModeState: vi.fn(
      (_id: string, next: AgentPlanModeState) => {
        Object.assign(planState, next)
      },
    ),
  })),
}))

const runForEachItemBatch = vi.hoisted(() => vi.fn())

vi.mock('../steps/foreach-item/batch-runner', () => ({
  runForEachItemBatch,
}))

import { getAgentRunSandboxRoot } from '@main/agent/sandbox/run-context'
import { bootstrapPlanModeStorage } from './plan-mode-state'
import {
  readPlanModeTodoList,
  writePlanModeTodoList,
} from './plan-mode-storage-impl'
import { replaceTodos } from '@shared/agent/todos'

describe('plan-mode-execution-bridge', () => {
  let sandboxRoot: string

  beforeEach(() => {
    resetAllPlanRemindersForTests()
    runForEachItemBatch.mockReset()
    sandboxRoot = mkdtempSync(join(tmpdir(), 'plan-bridge-'))
    Object.assign(planState, {
      status: 'plan_tool_execute',
      planSlug: 'implementation-plan',
    })
    vi.mocked(getAgentRunSandboxRoot).mockReturnValue(sandboxRoot)
    bootstrapPlanModeStorage('conv-1', 'implementation-plan', { sandboxRoot })
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
  })

  it('trackedTodosToTodoItems maps in_progress to in-progress', () => {
    const items = trackedTodosToTodoItems([
      { id: 't1', content: 'Alpha', status: 'in_progress' },
    ])
    expect(items[0]?.status).toBe('in-progress')
    expect(items[0]?.name).toBe('Alpha')
  })

  it('todoItemsToTrackedTodos round-trips statuses', () => {
    const tracked = todoItemsToTrackedTodos([
      {
        id: 1,
        name: 'Beta',
        description: 'Beta',
        success_criteria: 'ok',
        fallback_plan: 'retry',
        status: 'completed',
      },
    ])
    expect(tracked[0]?.status).toBe('completed')
    expect(tracked[0]?.success_criteria).toBe('ok')
  })

  it('trackedTodosToTodoItems maps verification fields', () => {
    const items = trackedTodosToTodoItems([
      {
        id: 't1',
        content: 'Ship feature',
        status: 'pending',
        success_criteria: 'Tests pass',
        verify_command: 'npm test',
        fallback_plan: 'skip',
      },
    ])
    expect(items[0]).toMatchObject({
      name: 'Ship feature',
      success_criteria: 'Tests pass',
      verify_command: 'npm test',
      fallback_plan: 'skip',
    })
  })

  it('todoItemsToTrackedTodos round-trips verification fields', () => {
    const pipeline = trackedTodosToTodoItems([
      {
        id: 't1',
        content: 'Ship',
        status: 'pending',
        success_criteria: 'Green CI',
        verify_command: 'npm run lint',
      },
    ])[0]!
    pipeline.status = 'completed'
    const tracked = todoItemsToTrackedTodos([pipeline])[0]
    expect(tracked).toMatchObject({
      content: 'Ship',
      status: 'completed',
      success_criteria: 'Green CI',
      verify_command: 'npm run lint',
    })
  })

  it('shouldRunPlanTodoForeach is true when execution active and todos pending', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([
        { content: 'Step one', status: 'pending' },
        { content: 'Step two', status: 'pending' },
      ]),
      { sandboxRoot },
    )
    expect(
      shouldRunPlanTodoForeach({
        opts: { conversationId: 'conv-1' },
      } as never),
    ).toBe(true)
  })

  it('shouldRunPlanTodoForeach is false while still in read-only planning', () => {
    planState.status = 'planning'
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Step one', status: 'pending' }]),
      { sandboxRoot },
    )
    expect(
      shouldRunPlanTodoForeach({
        opts: { conversationId: 'conv-1' },
      } as never),
    ).toBe(false)
  })

  it('shouldRunPlanTodoForeach is false when execution active but all todos done', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Step one', status: 'completed' }]),
      { sandboxRoot },
    )
    expect(
      shouldRunPlanTodoForeach({
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => sandboxRoot },
      } as never),
    ).toBe(false)
  })

  it('reconcilePlanExecutionStateFromDisk clears stale plan_tool_execute when all todos done', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Step one', status: 'completed' }]),
      { sandboxRoot },
    )
    reconcilePlanExecutionStateFromDisk({
      opts: { conversationId: 'conv-1' },
      sandbox: { getRoot: () => sandboxRoot },
    } as never)
    expect(planState.status).toBe('tool_execute')
    expect(
      readPlanModeTodoList('conv-1', { sandboxRoot }).todos,
    ).toHaveLength(0)
    expect(hasRecentPlanExecutionCompleted('conv-1')).toBe(true)
  })

  it('isPlanModeTodosAllDoneOnDisk reflects summarizeTodos on disk', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([
        { content: 'Step one', status: 'completed' },
        { content: 'Step two', status: 'completed' },
      ]),
      { sandboxRoot },
    )
    expect(
      isPlanModeTodosAllDoneOnDisk({
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => sandboxRoot },
      } as never),
    ).toBe(true)
  })

  it('syncPlanModeBatchTodosFromDisk updates in-memory batch statuses', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([
        { content: 'Step one', status: 'completed' },
        { content: 'Step two', status: 'pending' },
      ]),
      { sandboxRoot },
    )
    const batch: { status: string }[] = [
      { status: 'pending' },
      { status: 'pending' },
    ]
    syncPlanModeBatchTodosFromDisk(
      {
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => sandboxRoot },
      } as never,
      batch as never,
    )
    expect(batch[0]?.status).toBe('completed')
    expect(batch[1]?.status).toBe('pending')
  })

  it('syncPlanModeBatchTodosFromDisk replaces batch when disk list length changes', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([
        { content: 'Step one', status: 'completed' },
        { content: 'Step two', status: 'pending' },
        { content: 'Step three', status: 'pending' },
      ]),
      { sandboxRoot },
    )
    const batch = [
      { id: 1, name: 'old', status: 'pending' as const },
    ]
    syncPlanModeBatchTodosFromDisk(
      {
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => sandboxRoot },
      } as never,
      batch as never,
    )
    expect(batch).toHaveLength(3)
    expect(batch[2]?.name).toBe('Step three')
  })

  it('planModeTodoItemsFromContext reads plans/todos.json', () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Ship feature', status: 'pending' }]),
      { sandboxRoot },
    )
    const items = planModeTodoItemsFromContext({
      opts: { conversationId: 'conv-1' },
    } as never)
    expect(items).toHaveLength(1)
    expect(items[0]?.name).toBe('Ship feature')
  })

  it('runApprovedPlanTodoForeach runs foreach batch when todos are pending', async () => {
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Step one', status: 'pending' }]),
      { sandboxRoot },
    )
    const ctx = {
      opts: { conversationId: 'conv-1' },
      sandbox: { getRoot: () => sandboxRoot },
    } as never

    await expect(runApprovedPlanTodoForeach(ctx)).resolves.toBe(true)
    expect(runForEachItemBatch).toHaveBeenCalledTimes(1)
  })

  it('runApprovedPlanTodoForeach skips when execution should not run', async () => {
    planState.status = 'planning'
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Step one', status: 'pending' }]),
      { sandboxRoot },
    )

    await expect(
      runApprovedPlanTodoForeach({
        opts: { conversationId: 'conv-1' },
      } as never),
    ).resolves.toBe(false)
    expect(runForEachItemBatch).not.toHaveBeenCalled()
  })
})
