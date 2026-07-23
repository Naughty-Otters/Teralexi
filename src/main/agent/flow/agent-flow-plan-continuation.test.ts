import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AgentFlowBase } from './agent-flow-base'
import { AgentFlowContext } from '../context'
import { createFlowStageRegistry } from './stage-runners'

const runPlanExecutionContinuations = vi.hoisted(() => vi.fn(async () => 0))

vi.mock('../coding/plan-mode-execution-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../coding/plan-mode-execution-bridge')>()
  return {
    ...actual,
    runPlanExecutionContinuations,
  }
})

vi.mock('./pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pipeline')>()
  return {
    ...actual,
    executeFlowPipeline: vi.fn(async () => '{"version":2}'),
  }
})

vi.mock('../pending/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../pending/store')>()
  return {
    ...actual,
    deletePendingExecution: vi.fn(),
    getPendingExecution: vi.fn(() => null),
    pendingExecutionStorageKey: vi.fn(),
    setPendingExecution: vi.fn(),
    findPendingExecution: vi.fn(() => undefined),
  }
})

vi.mock('../form/pending-state', () => ({
  findPendingFormExecutionByRequestId: vi.fn(),
}))

vi.mock('../utils', () => ({
  clientUiIndicatesToolApprovalResume: vi.fn(() => false),
  cloneClientUiMessages: vi.fn((m: unknown) => m),
}))

import { executeFlowPipeline } from './pipeline'

class TestFlow extends AgentFlowBase {}

describe('AgentFlowBase plan execution continuations', () => {
  beforeEach(() => {
    runPlanExecutionContinuations.mockClear()
    vi.mocked(executeFlowPipeline).mockClear()
  })

  it('runs plan execution continuations after the main pipeline', async () => {
    const ctx = new AgentFlowContext(
      {
        provider: 'openai',
        model: 'gpt-4',
        conversationId: 'conv-1',
        messages: [],
      },
      {},
    )
    ctx.buildStructuredAssistantContent = vi.fn(() => '{"version":2}')
    const flow = new TestFlow(ctx, createFlowStageRegistry())
    flow.applyPipeline({
      apply(f) {
        f.begin().toolLoop()
      },
    })

    await flow.executeRunLifecycle()

    expect(executeFlowPipeline).toHaveBeenCalledTimes(1)
    expect(runPlanExecutionContinuations).toHaveBeenCalledTimes(1)
    expect(runPlanExecutionContinuations).toHaveBeenCalledWith(ctx)
  })
})
