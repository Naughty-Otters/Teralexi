import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => true),
}))

vi.mock('./plan-mode-exit-readiness', () => ({
  assessPlanModeExitReadiness: vi.fn(() => ({
    ready: true,
    todoCount: 2,
    hasActionablePlanSteps: true,
    planFilePath: 'plans/auth.md',
  })),
}))

vi.mock('../steps/step-helpers', () => ({
  createAgent: vi.fn(() => ({})),
  streamAgent: vi.fn(),
}))

import { isPlanModeActive } from './plan-mode-state'
import { assessPlanModeExitReadiness } from './plan-mode-exit-readiness'
import { createAgent, streamAgent } from '../steps/step-helpers'
import {
  nudgeExitPlanModeIfNeeded,
  streamIncludedExitPlanMode,
} from './plan-mode-exit-nudge'

describe('streamIncludedExitPlanMode', () => {
  it('detects exit_plan_mode in tool calls', () => {
    expect(
      streamIncludedExitPlanMode([
        { order: 1, id: 'c1', name: 'update_todos', input: {}, status: 'completed' },
        { order: 2, id: 'c2', name: 'exit_plan_mode', input: {}, status: 'pending' },
      ]),
    ).toBe(true)
    expect(streamIncludedExitPlanMode([])).toBe(false)
  })
})

describe('nudgeExitPlanModeIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    vi.mocked(assessPlanModeExitReadiness).mockReturnValue({
      ready: true,
      todoCount: 2,
      hasActionablePlanSteps: true,
    })
  })

  it('runs a continuation when plan is ready but exit_plan_mode was skipped', async () => {
    vi.mocked(streamAgent).mockResolvedValue({
      text: '',
      awaitingToolApproval: true,
      toolCalls: [{ order: 1, id: 'x', name: 'exit_plan_mode', input: {}, status: 'pending' }],
    })

    const parentCtx = {
      opts: { conversationId: 'conv-1', provider: 'ollama', model: 'test' },
      model: {},
      sandbox: { getRoot: () => '/tmp/sb' },
      resolveStageChoice: vi.fn(() => ({ provider: 'ollama', model: 'test' })),
      resolveStageModel: vi.fn(() => ({})),
    } as never
    const toolLoopCtx = {} as never

    const result = await nudgeExitPlanModeIfNeeded({
      parentCtx,
      toolLoopCtx,
      collected: {
        text: 'Plan is ready.',
        awaitingToolApproval: false,
        toolCalls: [{ order: 1, id: 't1', name: 'update_todos', input: {}, status: 'completed' }],
      },
      loopMessages: [{ role: 'user', content: 'Plan auth' }],
      toolSet: {
        exit_plan_mode: { execute: vi.fn() },
        read_todos: { execute: vi.fn() },
      },
      instructions: 'plan',
      haltCtrl: new AbortController().signal,
      streamParams: {
        onChunk: vi.fn(),
      },
    })

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'tool-loop-exit-plan-nudge',
        toolChoice: 'required',
      }),
    )
    expect(streamAgent).toHaveBeenCalledTimes(1)
    expect(result.awaitingToolApproval).toBe(true)
  })

  it('no-ops when exit_plan_mode was already called', async () => {
    const collected = {
      text: 'done',
      awaitingToolApproval: false,
      toolCalls: [{ order: 1, id: 'x', name: 'exit_plan_mode', input: {}, status: 'pending' }],
    }

    const result = await nudgeExitPlanModeIfNeeded({
      parentCtx: { opts: { conversationId: 'conv-1' }, model: {} } as never,
      toolLoopCtx: {} as never,
      collected,
      loopMessages: [],
      toolSet: { exit_plan_mode: {} },
      instructions: 'plan',
      haltCtrl: new AbortController().signal,
      streamParams: { onChunk: vi.fn() },
    })

    expect(streamAgent).not.toHaveBeenCalled()
    expect(result).toBe(collected)
  })
})
