import { describe, expect, it, vi } from 'vitest'

const runMock = vi.fn(async () => 'flow-output')

vi.mock('../context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context')>()
  return {
    ...actual,
    AgentFlowContext: class MockAgentFlowContext {
      opts: { provider: string; model: string }
      executionSteps?: unknown
      stepOutputs: Record<string, unknown> = {}
      constructor(opts: { provider: string; model: string }) {
        this.opts = opts
      }
      createStepContext = vi.fn()
    },
  }
})

vi.mock('../providers/context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../providers/context')>()
  return {
    ProviderContext: {
      createModelForOpts: actual.ProviderContext.createModelForOpts,
      createModel: actual.ProviderContext.createModel,
    },
  }
})


vi.mock('../steps/skills-tool-execution-step', () => ({
  SkillsToolExecutionStep: vi.fn(),
}))

vi.mock('../pending/store', () => ({
  deletePendingExecution: vi.fn(),
  getPendingExecution: vi.fn(() => null),
  pendingExecutionStorageKey: vi.fn(),
}))

vi.mock('../form/pending-state', () => ({
  findPendingFormExecutionByRequestId: vi.fn(),
}))

vi.mock('../utils', () => ({
  clientUiIndicatesToolApprovalResume: vi.fn(() => false),
  cloneClientUiMessages: vi.fn((m: unknown) => m),
}))

import { AgentFlow, openfde, streamAgentResponse } from './agent-flow'
import type { AgentFlowContext } from '../context'
import { createModelForProvider } from '../providers/adapters'
import {
  FOREACH_ITEM_STEP_ID,
  PLANNING_STEP_ID,
  PROMPT_STEP_ID,
  REPORT_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'

const baseOpts = {
  provider: 'ollama' as const,
  model: 'm',
  systemPrompt: '',
  messages: [],
  onChunk: vi.fn(),
  userId: 'u',
  ollamaBaseURL: '',
  llamacppBaseURL: 'http://127.0.0.1:8080/v1',
  llamacppApiKey: '',
  anthropicApiKey: '',
  openaiApiKey: '',
  openaiBaseURL: '',
  geminiApiKey: '',
  deepseekApiKey: '',
}

describe('AgentFlow fluent pipeline', () => {
  it('step() registers stages by id', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().step(TOOL_LOOP_STEP_ID, { toolLoopRun: { resumeTodoIndex: 2 } })
    expect(flow.pipelineStages()).toEqual([TOOL_LOOP_STEP_ID])
  })

  it('builds a linear pipeline with step()', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow
      .begin()
      .step(THINKING_STEP_ID)
      .step(PLANNING_STEP_ID)
      .step(TOOL_LOOP_STEP_ID)
      .step(SUMMARY_STEP_ID)
      .step(REPORT_STEP_ID)
    expect(flow.pipelineStages()).toEqual([
      THINKING_STEP_ID,
      PLANNING_STEP_ID,
      TOOL_LOOP_STEP_ID,
      SUMMARY_STEP_ID,
      REPORT_STEP_ID,
    ])
  })

  it('when().then_branch().else_branch() picks then branch', () => {
    const flow = new AgentFlow(baseOpts, {})
    const ctx = { stepOutputs: { summary: { summary: 'ok' } } } as AgentFlowContext
    flow
      .begin()
      .step(THINKING_STEP_ID)
      .when(() => true)
      .then_branch((b) => b.step(SUMMARY_STEP_ID))
      .else_branch((b) => b.step(REPORT_STEP_ID))
    expect(flow.resolvedPipelineStages(ctx)).toEqual([
      THINKING_STEP_ID,
      SUMMARY_STEP_ID,
    ])
  })

  it('when() after planning+toolLoop sees multi-todo plan for tail branch', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow
      .begin()
      .step(PLANNING_STEP_ID)
      .step(TOOL_LOOP_STEP_ID)
      .when((ctx) => (ctx.stepOutputs.planning?.todoList?.length ?? 0) > 0)
      .then_branch((b) => b.step(SUMMARY_STEP_ID))
      .else_branch((b) => b.step(REPORT_STEP_ID))

    const withTodos = {
      stepOutputs: {
        planning: {
          finalGoal: 'ship',
          todoList: [{ id: 1 }, { id: 2 }],
        },
      },
    } as AgentFlowContext

    expect(flow.resolvedPipelineStages(withTodos)).toEqual([
      PLANNING_STEP_ID,
      TOOL_LOOP_STEP_ID,
      SUMMARY_STEP_ID,
    ])
    expect(flow.resolvedPipelineStages({ stepOutputs: {} } as AgentFlowContext)).toEqual([
      PLANNING_STEP_ID,
      TOOL_LOOP_STEP_ID,
      REPORT_STEP_ID,
    ])
  })

  it('when().then_branch().else_branch() picks else branch', () => {
    const flow = new AgentFlow(baseOpts, {})
    const ctx = { stepOutputs: {} } as AgentFlowContext
    flow
      .begin()
      .when(() => false)
      .then_branch((b) => b.step(SUMMARY_STEP_ID))
      .else_branch((b) => b.step(REPORT_STEP_ID))
    expect(flow.resolvedPipelineStages(ctx)).toEqual([REPORT_STEP_ID])
  })

  it('when().then_branch().else_branch() with empty else', () => {
    const flow = new AgentFlow(baseOpts, {})
    const ctx = { stepOutputs: {} } as AgentFlowContext
    flow.begin().when(() => false).then_branch((b) => b.step(SUMMARY_STEP_ID)).else_branch()
    expect(flow.resolvedPipelineStages(ctx)).toEqual([])
  })

  it('customStep registers prompt stage with config', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().customStep({
      systemMessage: 'You are a reviewer.',
      instructions: 'List risks only.',
      title: 'Risk review',
    })
    expect(flow.pipelineStages()).toEqual([PROMPT_STEP_ID])
  })

  it('step() accepts StepExpression', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow
      .begin()
      .step(
        SUMMARY_STEP_ID,
        openfde.expr
          .system_msg('Exec summary only')
          .prompt('Return JSON')
          .precondition('hasToolLoop'),
      )
    expect(flow.pipelineStages()).toEqual([SUMMARY_STEP_ID])
  })

  it('thinking() registers THINKING with default expression plan and runner', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().thinking()
    expect(flow.pipelineStages()).toEqual([THINKING_STEP_ID])
    const entry = (
      flow as unknown as {
        pipeline: {
          id: string
          runner?: { id: string }
          config?: { expressionPlan?: { instructions?: string } }
        }[]
      }
    ).pipeline[0]
    expect(entry.runner?.id).toBe(THINKING_STEP_ID)
    expect(entry.config?.expressionPlan?.instructions).toBeUndefined()
  })

  it('thinking() accepts factory StepExpression', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().thinking((e) => e.prompt('API focus only'))
    const entry = (
      flow as unknown as { pipeline: { config?: { expressionPlan?: { userPrompt?: string } } }[] }
    ).pipeline[0]
    expect(entry.config?.expressionPlan?.userPrompt).toBe('API focus only')
  })

  it('step() accepts systemMessage and instructions overrides', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().step(SUMMARY_STEP_ID, {
      systemMessage: 'Custom summary system',
      instructions: 'Return JSON with risks only',
    })
    expect(flow.pipelineStages()).toEqual([SUMMARY_STEP_ID])
  })

  it('forEachItem() registers foreachItem stage with config', () => {
    const flow = new AgentFlow(baseOpts, {})
    const runItem = vi.fn()
    flow
      .begin()
      .step(PLANNING_STEP_ID)
      .forEachItem({
        itemsFrom: () => [{ n: 1 }],
        runItem,
      })
    expect(flow.pipelineStages()).toEqual([PLANNING_STEP_ID, FOREACH_ITEM_STEP_ID])
  })

  it('hasConfiguredPipeline is true after step() or when()', () => {
    const flow = new AgentFlow(baseOpts, {})
    expect(flow.hasConfiguredPipeline()).toBe(false)
    flow.begin().step(THINKING_STEP_ID)
    expect(flow.hasConfiguredPipeline()).toBe(true)
    flow.begin().when(() => true).then_branch((b) => b.step(SUMMARY_STEP_ID)).else_branch()
    expect(flow.hasConfiguredPipeline()).toBe(true)
  })

  it('ensurePipelineForRun keeps explicit pipeline', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().step(THINKING_STEP_ID).step(PLANNING_STEP_ID)
    const fromSpy = vi.spyOn(flow, 'fromAgentConfig')
    ;(flow as unknown as { ensurePipelineForRun: () => void }).ensurePipelineForRun()
    expect(fromSpy).not.toHaveBeenCalled()
    expect(flow.pipelineStages()).toEqual([THINKING_STEP_ID, PLANNING_STEP_ID])
  })

  it('begin() clears linear pipeline and conditional branches', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow
      .begin()
      .step(THINKING_STEP_ID)
      .when(() => true)
      .then_branch((b) => b.step(SUMMARY_STEP_ID))
      .else_branch()
    flow.begin().step(PLANNING_STEP_ID)
    expect(flow.pipelineStages()).toEqual([PLANNING_STEP_ID])
    expect(flow.resolvedPipelineStages({} as AgentFlowContext)).toEqual([
      PLANNING_STEP_ID,
    ])
  })

  it('steps() replaces the linear pipeline', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().step(THINKING_STEP_ID).steps([{ id: REPORT_STEP_ID }])
    expect(flow.pipelineStages()).toEqual([REPORT_STEP_ID])
  })

  it('forEachItem with hasTodoItems preset registers stage', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.begin().step(PLANNING_STEP_ID).forEachItem({ preset: 'hasTodoItems' })
    expect(flow.pipelineStages()).toEqual([PLANNING_STEP_ID, FOREACH_ITEM_STEP_ID])
  })

  it('forEachItem inside then_branch', () => {
    const flow = new AgentFlow(baseOpts, {})
    const ctx = {
      stepOutputs: { planning: { finalGoal: 'g', todoList: [{ id: 1 }] } },
    } as AgentFlowContext
    flow
      .begin()
      .step(PLANNING_STEP_ID)
      .when((c) => (c.stepOutputs.planning?.todoList?.length ?? 0) > 0)
      .then_branch((b) =>
        b.forEachItem({ preset: 'hasTodoItems' }).step(SUMMARY_STEP_ID),
      )
      .else_branch((b) => b.step(REPORT_STEP_ID))
    expect(flow.resolvedPipelineStages(ctx)).toEqual([
      PLANNING_STEP_ID,
      FOREACH_ITEM_STEP_ID,
      SUMMARY_STEP_ID,
    ])
  })

  it('defaultPipeline registers conditional toolLoop branches', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.defaultPipeline()
    expect(flow.pipelineStages()).toEqual([])
    expect(
      (flow as unknown as { conditionalBranches: unknown[] }).conditionalBranches
        .length,
    ).toBeGreaterThan(0)
  })

  it('fromAgentConfig falls back to React pipeline when executionSteps empty', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow.fromAgentConfig()
    expect(flow.pipelineStages()).toEqual([])
  })

  it('step() StepExpression precondition becomes entry.when', () => {
    const flow = new AgentFlow(baseOpts, {})
    flow
      .begin()
      .step(SUMMARY_STEP_ID, openfde.expr.precondition(() => true))
    const entries = (
      flow as unknown as { pipeline: { id: string; when?: unknown }[] }
    ).pipeline
    expect(entries[0].when).toBeTypeOf('function')
  })

  it('ensurePipelineForRun applies fromAgentConfig when pipeline empty', () => {
    const flow = new AgentFlow(
      {
        ...baseOpts,
        executionSteps: { planning: 'Plan', toolLoop: { tools: [] } },
      },
      {},
    )
    const fromSpy = vi.spyOn(flow, 'fromAgentConfig').mockReturnValue(flow)
    ;(flow as unknown as { ensurePipelineForRun: () => void }).ensurePipelineForRun()
    expect(fromSpy).toHaveBeenCalled()
  })
})

describe('AgentFlow', () => {
  it('streamAgentResponse uses provider adapter and runs flow', async () => {
    const { AgentRun } = await import('../run/agent-run')
    vi.spyOn(AgentRun.prototype, 'execute').mockResolvedValue({
      structuredContent: 'flow-output',
      stepOutputs: {},
      hitlPaused: false,
      shouldPersistMemory: true,
    })
    const out = await streamAgentResponse({
      ...baseOpts,
      provider: 'ollama',
      model: 'llama',
    })
    expect(out.structuredContent).toBe('flow-output')
    expect(out.shouldPersistMemory).toBe(true)
  })

  it('throws for unknown provider', () => {
    expect(() =>
      createModelForProvider('unknown' as never, 'x', {} as never),
    ).toThrow(/Unknown provider/)
  })
})
