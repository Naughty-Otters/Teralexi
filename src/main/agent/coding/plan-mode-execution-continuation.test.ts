import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentPlanModeState } from '@shared/agent/plan-mode'
import {
  exitPlanModeOutputSucceeded,
  resolvePlanExecutionMaxContinuationRounds,
  runPlanExecutionContinuations,
} from './plan-mode-execution-continuation'
import {
  hasExecuteContinuationReminder,
  resetAllPlanRemindersForTests,
} from './plan-mode-session-reminders'
import { bootstrapPlanModeStorage } from './plan-mode-state'
import { writePlanModeTodoList } from './plan-mode-storage-impl'
import { replaceTodos } from '@shared/agent/todos'

const { planState } = vi.hoisted(() => {
  const planState: AgentPlanModeState = {
    status: 'plan_tool_execute',
    planSlug: 'implementation-plan',
  }
  return { planState }
})

const runApprovedPlanTodoForeach = vi.hoisted(() => vi.fn())

vi.mock('./plan-mode-todo-foreach', () => ({
  runApprovedPlanTodoForeach,
}))

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

import { getAgentRunSandboxRoot } from '@main/agent/sandbox/run-context'

function makeCtx(overrides: Record<string, unknown> = {}) {
  const emitStepProgress = vi.fn()
  return {
    opts: { conversationId: 'conv-1', todoMaxRetries: 3 },
    sandbox: { getRoot: () => sandboxRoot },
    hitlAwaitingApproval: false,
    hitlAwaitingFormData: false,
    hitlAwaitingManualIntervention: false,
    emitStepProgress,
    ...overrides,
  } as never
}

let sandboxRoot: string

describe('plan-mode-execution-continuation', () => {
  beforeEach(() => {
    resetAllPlanRemindersForTests()
    runApprovedPlanTodoForeach.mockReset()
    runApprovedPlanTodoForeach.mockResolvedValue(true)
    sandboxRoot = mkdtempSync(join(tmpdir(), 'plan-continuation-'))
    Object.assign(planState, {
      status: 'plan_tool_execute',
      planSlug: 'implementation-plan',
    })
    vi.mocked(getAgentRunSandboxRoot).mockReturnValue(sandboxRoot)
    bootstrapPlanModeStorage('conv-1', 'implementation-plan', { sandboxRoot })
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([
        { content: 'Step one', status: 'pending' },
        { content: 'Step two', status: 'pending' },
      ]),
      { sandboxRoot },
    )
  })

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true })
  })

  it('exitPlanModeOutputSucceeded accepts ok output only', () => {
    expect(exitPlanModeOutputSucceeded({ ok: true, status: 'plan_tool_execute' })).toBe(
      true,
    )
    expect(exitPlanModeOutputSucceeded({ error: 'failed' })).toBe(false)
    expect(exitPlanModeOutputSucceeded(null)).toBe(false)
  })

  it('resolvePlanExecutionMaxContinuationRounds scales with unfinished todos', () => {
    const max = resolvePlanExecutionMaxContinuationRounds(makeCtx())
    expect(max).toBeGreaterThanOrEqual(2)
    expect(max).toBeLessThanOrEqual(10)
  })

  it('continues foreach while todos remain unfinished', async () => {
    runApprovedPlanTodoForeach
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockImplementation(async () => {
        writePlanModeTodoList(
          'conv-1',
          replaceTodos([
            { content: 'Step one', status: 'completed' },
            { content: 'Step two', status: 'completed' },
          ]),
          { sandboxRoot },
        )
        return true
      })

    const ctx = makeCtx()
    const rounds = await runPlanExecutionContinuations(ctx)

    expect(rounds).toBeGreaterThanOrEqual(1)
    expect(runApprovedPlanTodoForeach).toHaveBeenCalled()
    expect(ctx.emitStepProgress).toHaveBeenCalled()
  })

  it('stops immediately when HITL is paused', async () => {
    const ctx = makeCtx({ hitlAwaitingApproval: true })
    const rounds = await runPlanExecutionContinuations(ctx)
    expect(rounds).toBe(0)
    expect(runApprovedPlanTodoForeach).not.toHaveBeenCalled()
  })

  it('does not run when plan execution is inactive', async () => {
    planState.status = 'planning'
    const ctx = makeCtx()
    const rounds = await runPlanExecutionContinuations(ctx)
    expect(rounds).toBe(0)
    expect(runApprovedPlanTodoForeach).not.toHaveBeenCalled()
  })

  it('stops when runApprovedPlanTodoForeach returns false', async () => {
    runApprovedPlanTodoForeach.mockResolvedValue(false)
    const ctx = makeCtx()
    const rounds = await runPlanExecutionContinuations(ctx)
    expect(rounds).toBe(0)
    expect(runApprovedPlanTodoForeach).toHaveBeenCalledTimes(1)
  })

  it('marks continuation reminder on rounds after the first', async () => {
    runApprovedPlanTodoForeach.mockResolvedValue(true)
    const ctx = makeCtx()
    await runPlanExecutionContinuations(ctx)
    expect(hasExecuteContinuationReminder('conv-1')).toBe(true)
  })

  it('stops at max rounds and emits warning when todos stay pending', async () => {
    runApprovedPlanTodoForeach.mockResolvedValue(true)
    writePlanModeTodoList(
      'conv-1',
      replaceTodos([{ content: 'Only step', status: 'pending' }]),
      { sandboxRoot },
    )
    const ctx = makeCtx({ opts: { conversationId: 'conv-1', todoMaxRetries: 1 } })
    const rounds = await runPlanExecutionContinuations(ctx)
    expect(rounds).toBe(1)
    expect(ctx.emitStepProgress).toHaveBeenCalledWith(
      expect.stringContaining('continuation limit'),
    )
  })
})
