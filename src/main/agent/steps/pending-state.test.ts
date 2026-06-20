import { describe, expect, it, vi } from 'vitest'
import { AgentFlowContext } from '../context'
import { RESEARCH_STEP_ID } from '../constants/step-ids'
import { ResearchStepContext } from './research/research-step-context'
import {
  patchPendingExecutionPausedStage,
  savePendingApprovalState,
} from './pending-state'

vi.mock('../pending/store', () => ({
  pendingExecutionStorageKey: vi.fn(() => 'pending-key'),
  getPendingExecution: vi.fn(),
  setPendingExecution: vi.fn(),
}))

describe('patchPendingExecutionPausedStage', () => {
  it('updates pausedStageId on an existing pending snapshot', async () => {
    const { getPendingExecution, setPendingExecution } =
      await import('../pending/store')
    vi.mocked(getPendingExecution).mockReturnValue({
      currentMessages: [],
      stepOutputs: {},
      stepContexts: {},
      stepHistory: [],
      nextTodoIndex: 0,
      collectedFormByTodoId: {},
    })

    patchPendingExecutionPausedStage('c1', 'a1', 'c1:a1::toolLoop')

    expect(setPendingExecution).toHaveBeenCalledWith(
      'pending-key',
      expect.objectContaining({ pausedStageId: 'c1:a1::toolLoop' }),
    )
  })

  it('no-ops when pending snapshot is missing', async () => {
    const { getPendingExecution, setPendingExecution } =
      await import('../pending/store')
    vi.mocked(getPendingExecution).mockReturnValue(undefined)

    patchPendingExecutionPausedStage('c1', 'a1', 'c1:a1::toolLoop')

    expect(setPendingExecution).not.toHaveBeenCalled()
  })
})

describe('savePendingApprovalState', () => {
  it('persists pending execution when storage key exists', async () => {
    const { setPendingExecution } = await import('../pending/store')
    const ctx = {
      opts: { conversationId: 'c1', assistantMessageId: 'a1' },
      currentMessages: [],
      stepOutputs: {},
      stepContexts: {},
      stepHistory: [],
      collectedFormByTodoId: { 1: { x: 1 } },
    }
    savePendingApprovalState(ctx as never, 2, 9)
    expect(setPendingExecution).toHaveBeenCalledWith(
      'pending-key',
      expect.objectContaining({
        nextTodoIndex: 2,
        pendingApprovalTodoId: 9,
        collectedFormByTodoId: { 1: { x: 1 } },
      }),
    )
  })

  it('includes researchResumeState for ResearchStepContext', async () => {
    const { setPendingExecution } = await import('../pending/store')
    const flow = new AgentFlowContext(
      {
        provider: 'ollama',
        model: 'test',
        systemPrompt: '',
        messages: [],
        userId: 'u1',
      },
      {},
    )
    const ctx = new ResearchStepContext(
      flow,
      RESEARCH_STEP_ID,
      'Research',
      'research:1',
    )
    ctx.researchResumeState = {
      topic: 'otters',
      findings: [],
      researchedKeys: ['otters'],
      pendingQuestions: ['habitat'],
      round: 1,
      totalResearched: 1,
    }

    savePendingApprovalState(ctx)

    expect(setPendingExecution).toHaveBeenCalledWith(
      'pending-key',
      expect.objectContaining({
        researchResumeState: ctx.researchResumeState,
      }),
    )
  })

  it('persists manual intervention pending metadata', async () => {
    const { setPendingExecution } = await import('../pending/store')
    const ctx = {
      opts: { conversationId: 'c1', assistantMessageId: 'a1' },
      currentMessages: [],
      stepOutputs: {},
      stepContexts: {},
      stepHistory: [],
      collectedFormByTodoId: {},
    }
    savePendingApprovalState(ctx as never, 2, 9, {
      awaitingManualIntervention: true,
    })
    expect(setPendingExecution).toHaveBeenCalledWith(
      'pending-key',
      expect.objectContaining({
        nextTodoIndex: 2,
        awaitingManualIntervention: true,
        pendingManualInterventionTodoId: 9,
      }),
    )
    expect(setPendingExecution).toHaveBeenCalledWith(
      'pending-key',
      expect.not.objectContaining({ pendingApprovalTodoId: 9 }),
    )
  })

  it('no-ops when storage key is missing', async () => {
    const { pendingExecutionStorageKey, setPendingExecution } =
      await import('../pending/store')
    vi.mocked(pendingExecutionStorageKey).mockReturnValueOnce('')
    savePendingApprovalState({ opts: {} } as never)
    expect(setPendingExecution).not.toHaveBeenCalled()
  })
})
