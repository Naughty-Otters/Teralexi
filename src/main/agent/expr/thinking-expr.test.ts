import { describe, expect, it, vi, beforeEach } from 'vitest'
import { thinkingFlowStepDefinition } from './thinking-expr'

vi.mock('./run-expression-llm', () => ({
  runExpressionLlmText: vi.fn(),
}))

vi.mock('./thinking-tool-loop', () => ({
  runThinkingResearchPass: vi.fn(async () => null),
}))

vi.mock('../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
  isPlanExecutionActive: vi.fn(() => false),
  planModeFor: vi.fn(() => ({
    activatePlanning: vi.fn(),
  })),
  bootstrapPlanModeStorage: vi.fn(() => ({
    planFile: { displayPath: 'plans/test.md' },
  })),
  planModeStorageOptionsFromEnv: vi.fn(() => ({ sandboxRoot: '/tmp/sb' })),
}))

import { runExpressionLlmText } from './run-expression-llm'
import {
  bootstrapPlanModeStorage,
  isPlanExecutionActive,
  isPlanModeActive,
  planModeFor,
} from '../coding/plan-mode-state'

function thinkingJson(fields: Record<string, unknown>): string {
  return JSON.stringify({
    context: [],
    rationale: '',
    response: '',
    ...fields,
  })
}

function makeStepCtx(overrides?: {
  userMessage?: string
  runtimeTools?: Array<{ name: string; source: string }>
  skillId?: string
  agentRun?: { meta?: { depth?: number } }
}) {
  const runtimeTools = overrides?.runtimeTools ?? []
  const appendAssistantTurn = vi.fn()
  const recordStepOutput = vi.fn()
  const beginStep = vi.fn(() => ({ key: 'thinking:0' }))
  return {
    opts: {
      conversationId: 'conv-1',
      userId: 'u1',
      skillId: overrides?.skillId,
    },
    executionSteps: {
      toolLoop: { tools: runtimeTools },
    },
    runtimeTools,
    currentMessages: [{ role: 'user', content: overrides?.userMessage ?? 'Hello' }],
    config: { withResponseLanguageInstruction: (t: string) => t },
    emitStepProgress: vi.fn(),
    setStepProgressContent: vi.fn(),
    beginStep,
    recordStepOutput,
    appendAssistantTurn,
    getLatestUserMessageContent: () => overrides?.userMessage ?? 'Hello',
    agentRun: overrides?.agentRun,
  } as never
}

function makeRun(stepCtx: ReturnType<typeof makeStepCtx>) {
  return {
    flow: {
      createStepContext: () => stepCtx,
    },
    config: {},
  } as never
}

describe('thinkingFlowStepDefinition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isPlanModeActive).mockReturnValue(false)
    vi.mocked(isPlanExecutionActive).mockReturnValue(false)
    vi.mocked(planModeFor).mockReturnValue({
      activatePlanning: vi.fn(),
    } as never)
  })

  it('activates plan mode when routing to planning', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'planning',
      goal: 'Build auth',
      task: 'Plan authentication feature',
      context: [],
}),
    )

    const stepCtx = makeStepCtx()
    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    expect(planModeFor).toHaveBeenCalledWith('conv-1')
    expect(vi.mocked(planModeFor).mock.results[0]?.value.activatePlanning).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'thinking:route_planning' }),
    )
    expect(bootstrapPlanModeStorage).toHaveBeenCalled()
    expect(runExpressionLlmText).toHaveBeenCalledWith(
      stepCtx,
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({
        streamToProgress: true,
        pipeTextStreamToProgress: true,
        replaceProgressWith: expect.any(Function),
      }),
    )
  })

  it('appends direct answer response as primary turn', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'direct_answer',
      goal: 'Explain',
      task: 'What is Rust?',
      context: [],
      response: 'Rust is a systems programming language.',
}),
    )

    const stepCtx = makeStepCtx({ userMessage: 'What is Rust?' })
    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    expect(stepCtx.appendAssistantTurn).toHaveBeenCalledWith(
      'Rust is a systems programming language.',
    )
  })

  it('does not re-bootstrap plan mode when already active', async () => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'planning',
      goal: 'Continue plan',
      task: 'Update plan',
      context: [],
}),
    )

    const stepCtx = makeStepCtx()
    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    expect(bootstrapPlanModeStorage).not.toHaveBeenCalled()
  })

  it('does not activate explore mode while approved plan execution is active', async () => {
    vi.mocked(isPlanExecutionActive).mockReturnValue(true)
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'planning',
      goal: 'Build auth',
      task: 'Plan authentication feature',
      context: [],
}),
    )

    const stepCtx = makeStepCtx()
    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    expect(planModeFor).not.toHaveBeenCalled()
    expect(bootstrapPlanModeStorage).not.toHaveBeenCalled()
  })

  it('forces agent_call for sub-agent runs even when plan mode is active', async () => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'planning',
      goal: 'Build auth',
      task: 'Plan authentication feature',
      context: [],
}),
    )

    const stepCtx = makeStepCtx({ agentRun: { meta: { depth: 1 } } })
    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    const recorded = stepCtx.recordStepOutput.mock.calls[0]?.[2] as {
      execution_mode?: string
    }
    expect(recorded.execution_mode).toBe('agent_call')
    expect(planModeFor).not.toHaveBeenCalled()
    expect(bootstrapPlanModeStorage).not.toHaveBeenCalled()
  })

  it('forces planning mode when plan mode is already active', async () => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'direct_answer',
      goal: 'Explain',
      task: 'What is Rust?',
      context: [],
      response: 'Rust is a systems programming language.',
}),
    )

    const stepCtx = makeStepCtx()
    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    const recorded = stepCtx.recordStepOutput.mock.calls[0]?.[2] as {
      execution_mode?: string
      response?: string
    }
    expect(recorded.execution_mode).toBe('planning')
    expect(recorded.response).toBeUndefined()
    expect(stepCtx.appendAssistantTurn).not.toHaveBeenCalledWith(
      'Rust is a systems programming language.',
    )
  })

  it('corrects direct_answer to agent_call when user asks for execution', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'direct_answer',
      goal: 'Explain fix',
      task: 'Describe the fix',
      context: [],
      response: 'You could change the null check…',
}),
    )

    const stepCtx = makeStepCtx({
      userMessage: 'Fix the failing test in runtime.test.ts',
      runtimeTools: [{ name: 'read_file', source: 'skill' }],
      skillId: 'demo',
    })

    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    const recorded = stepCtx.recordStepOutput.mock.calls[0]?.[2] as {
      execution_mode?: string
      response?: string
    }
    expect(recorded.execution_mode).toBe('agent_call')
    expect(recorded.response).toBeUndefined()
    expect(stepCtx.appendAssistantTurn).not.toHaveBeenCalledWith(
      'You could change the null check…',
    )
  })

  it('corrects ambiguous direct_answer when tools are enabled', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      thinkingJson({      execution_mode: 'direct_answer',
      goal: 'Advise',
      task: 'Suggest approach',
      context: [],
      response: 'You should split the module…',
}),
    )

    const stepCtx = makeStepCtx({
      userMessage: 'What is the best way to refactor the auth module?',
      runtimeTools: [{ name: 'read_file', source: 'skill' }],
      skillId: 'demo',
    })

    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    const recorded = stepCtx.recordStepOutput.mock.calls[0]?.[2] as {
      execution_mode?: string
    }
    expect(recorded.execution_mode).toBe('agent_call')
  })

  it('downgrades agent_call for explain/plot and retries for direct_answer response', async () => {
    vi.mocked(runExpressionLlmText)
      .mockResolvedValueOnce(
        thinkingJson({        execution_mode: 'agent_call',
        goal: 'Explain sin',
        task: 'Describe sin(x)',
        context: [],
        response: '',
}),
      )
      .mockResolvedValueOnce(
        thinkingJson({        execution_mode: 'direct_answer',
        goal: 'Explain sin',
        task: 'Describe sin(x)',
        context: [],
        response:
          'Sine is periodic.\n\n```diagram\n{"version":1,"layers":[{"type":"plot","fn":"sin(x)"}]}\n```',
}),
      )

    const stepCtx = makeStepCtx({
      userMessage: 'Explain sin(x)',
      runtimeTools: [{ name: 'run_script', source: 'skill' }],
      skillId: 'demo',
    })

    await thinkingFlowStepDefinition.run!(makeRun(stepCtx))

    expect(runExpressionLlmText).toHaveBeenCalledTimes(2)
    const recorded = stepCtx.recordStepOutput.mock.calls[0]?.[2] as {
      execution_mode?: string
      response?: string
    }
    expect(recorded.execution_mode).toBe('direct_answer')
    expect(recorded.response).toContain('```diagram')
    expect(stepCtx.appendAssistantTurn).toHaveBeenCalledWith(
      expect.stringContaining('```diagram'),
    )
  })
})
