import { describe, expect, it, vi } from 'vitest'

vi.mock('../steps/pending-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../steps/pending-state')>()
  return {
    ...actual,
    patchPendingExecutionPausedStage: vi.fn(),
  }
})

vi.mock('../steps/skills-tool-execution-step', () => ({
  SkillsToolExecutionStep: class {
    shouldRun() {
      return false
    }
    async execute() {}
    async resumeAfterToolApproval() {}
  },
}))
import {
  executeFlowPipeline,
  findPipelineEntryIndexByStageId,
  FlowPipelineRegistry,
  type FlowPipelineRegistry as FlowPipelineRegistryType,
  type StepHook,
  type PipelineEntry,
} from './pipeline'
import {
  FOREACH_ITEM_STEP_ID,
  PLANNING_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'
import {
  resolvedPipelineStageIds,
  type FlowConditionalBranch,
} from './pipeline'
import { createFlowStageRegistry } from './stage-runners'

function makeCtx(overrides: Record<string, unknown> = {}) {
  let pipelineGotoStageId: string | undefined
  const ctx = {
    flowId: 'test-flow',
    stepOutputs: {},
    executionSteps: {},
    opts: { skillId: 'skill-1' },
    hitlAwaitingApproval: false,
    hitlAwaitingFormData: false,
    lastHitlPausedStageId: undefined as string | undefined,
    createStepContext: vi.fn((...args: unknown[]) => ({ args })),
    buildStructuredAssistantContent: vi.fn(() => 'structured-out'),
    emitStepProgress: vi.fn(),
    setHitlPausedAtStage(stageId: string) {
      ctx.lastHitlPausedStageId = `test-flow::${stageId}`
    },
    requestPipelineGoto: vi.fn((stageId: string) => {
      pipelineGotoStageId = stageId
    }),
    consumePipelineGoto: vi.fn(() => {
      const id = pipelineGotoStageId
      pipelineGotoStageId = undefined
      return id
    }),
    ...overrides,
  }
  return ctx as never
}

function registryWith(defs: StepHook[]): FlowPipelineRegistryType {
  const map = new Map(defs.map((d) => [d.id, d]))
  return {
    get: (id: string) => map.get(id as never),
  } as FlowPipelineRegistryType
}

describe('executeFlowPipeline', () => {
  it('returns structured content when linear and branches are empty', async () => {
    const ctx = makeCtx()
    const out = await executeFlowPipeline({
      ctx,
      linear: [],
      returnIfHitlPaused: () => null,
    })
    expect(out).toBe('structured-out')
    expect(ctx.buildStructuredAssistantContent).toHaveBeenCalled()
  })

  it('skips entries whose entry.when is false', async () => {
    const run = vi.fn()
    const ctx = makeCtx()
    const entries: PipelineEntry[] = [
      { id: PLANNING_STEP_ID, when: () => false },
      { id: SUMMARY_STEP_ID },
    ]

    await executeFlowPipeline({
      ctx,
      linear: entries,
      registry: registryWith([
        { id: PLANNING_STEP_ID, title: 'P', run },
        { id: SUMMARY_STEP_ID, title: 'S', run },
      ]),
      returnIfHitlPaused: () => null,
    })

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('skips stage when definition.shouldRun returns false', async () => {
    const run = vi.fn()
    const ctx = makeCtx()

    await executeFlowPipeline({
      ctx,
      linear: [{ id: PLANNING_STEP_ID }, { id: SUMMARY_STEP_ID }],
      registry: registryWith([
        {
          id: PLANNING_STEP_ID,
          title: 'P',
          shouldRun: () => false,
          run,
        },
        { id: SUMMARY_STEP_ID, title: 'S', run },
      ]),
      returnIfHitlPaused: () => null,
    })

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('returns early when after hook returns content', async () => {
    const run = vi.fn()
    const ctx = makeCtx()

    const out = await executeFlowPipeline({
      ctx,
      linear: [{ id: PLANNING_STEP_ID }],
      registry: registryWith([
        {
          id: PLANNING_STEP_ID,
          title: 'P',
          run,
          after: async () => 'early-stop',
        },
      ]),
      returnIfHitlPaused: () => null,
    })

    expect(out).toBe('early-stop')
    expect(ctx.buildStructuredAssistantContent).not.toHaveBeenCalled()
  })

  it('pauses after toolLoop when HITL flags are set', async () => {
    const { patchPendingExecutionPausedStage } = await import(
      '../steps/pending-state'
    )
    const run = vi.fn()
    const ctx = makeCtx({
      hitlAwaitingApproval: true,
      opts: { skillId: 'skill-1', conversationId: 'c1', assistantMessageId: 'a1' },
    })

    const out = await executeFlowPipeline({
      ctx,
      linear: [{ id: TOOL_LOOP_STEP_ID }],
      registry: registryWith([
        { id: TOOL_LOOP_STEP_ID, title: 'T', hitlPausePoint: true, run },
      ]),
      returnIfHitlPaused: () => 'hitl-paused',
    })

    expect(out).toBe('hitl-paused')
    expect(run).toHaveBeenCalledTimes(1)
    expect(ctx.lastHitlPausedStageId).toBe('test-flow::toolLoop')
    expect(patchPendingExecutionPausedStage).toHaveBeenCalledWith(
      'c1',
      'a1',
      'test-flow::toolLoop',
    )
  })

  it('pauses after foreachItem when HITL flags are set', async () => {
    const run = vi.fn()
    const ctx = makeCtx({ hitlAwaitingFormData: true })

    const out = await executeFlowPipeline({
      ctx,
      linear: [{ id: FOREACH_ITEM_STEP_ID }],
      registry: registryWith([
        { id: FOREACH_ITEM_STEP_ID, title: 'Each', hitlPausePoint: true, run },
      ]),
      returnIfHitlPaused: () => 'form-paused',
    })

    expect(out).toBe('form-paused')
  })

  it('does not pause HITL after non-interactive stages', async () => {
    const run = vi.fn()
    const ctx = makeCtx({ hitlAwaitingApproval: true })

    const out = await executeFlowPipeline({
      ctx,
      linear: [{ id: SUMMARY_STEP_ID }],
      registry: registryWith([
        { id: SUMMARY_STEP_ID, title: 'S', run },
      ]),
      returnIfHitlPaused: () => 'hitl-paused',
    })

    expect(out).toBe('structured-out')
  })

  it('runs stage from entry.runner without registry lookup', async () => {
    const run = vi.fn()
    const ctx = makeCtx()

    await executeFlowPipeline({
      ctx,
      linear: [{ id: TOOL_LOOP_STEP_ID, runner: { id: TOOL_LOOP_STEP_ID, title: 'T', run } }],
      registry: createFlowStageRegistry(),
      returnIfHitlPaused: () => null,
    })

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('throws for unknown stage id', async () => {
    await expect(
      executeFlowPipeline({
        ctx: makeCtx(),
        linear: [{ id: 'unknownStage' as never }],
        registry: registryWith([]),
        returnIfHitlPaused: () => null,
      }),
    ).rejects.toThrow(/Unknown flow stage/)
  })

  it('jumps forward when a stage requests pipeline goto', async () => {
    const order: string[] = []
    const ctx = makeCtx()
    const entries: PipelineEntry[] = [
      { id: PLANNING_STEP_ID },
      { id: TOOL_LOOP_STEP_ID },
      { id: SUMMARY_STEP_ID },
    ]

    await executeFlowPipeline({
      ctx,
      linear: entries,
      registry: registryWith([
        {
          id: PLANNING_STEP_ID,
          title: 'P',
          run: async () => {
            order.push(PLANNING_STEP_ID)
          },
        },
        {
          id: TOOL_LOOP_STEP_ID,
          title: 'T',
          run: async ({ flow }) => {
            order.push(TOOL_LOOP_STEP_ID)
            flow.requestPipelineGoto(SUMMARY_STEP_ID)
          },
        },
        {
          id: SUMMARY_STEP_ID,
          title: 'S',
          run: async () => {
            order.push(SUMMARY_STEP_ID)
          },
        },
      ]),
      returnIfHitlPaused: () => null,
    })

    expect(order).toEqual([PLANNING_STEP_ID, TOOL_LOOP_STEP_ID, SUMMARY_STEP_ID])
  })

  it('re-runs an earlier stage when goto targets a previous step', async () => {
    const order: string[] = []
    let toolLoopRuns = 0
    const ctx = makeCtx()

    await executeFlowPipeline({
      ctx,
      linear: [
        { id: PLANNING_STEP_ID },
        { id: TOOL_LOOP_STEP_ID },
        { id: SUMMARY_STEP_ID },
      ],
      registry: registryWith([
        {
          id: PLANNING_STEP_ID,
          title: 'P',
          run: async () => {
            order.push(PLANNING_STEP_ID)
          },
        },
        {
          id: TOOL_LOOP_STEP_ID,
          title: 'T',
          run: async ({ flow }) => {
            order.push(TOOL_LOOP_STEP_ID)
            toolLoopRuns += 1
            if (toolLoopRuns === 1) {
              flow.requestPipelineGoto(PLANNING_STEP_ID)
            }
          },
        },
        {
          id: SUMMARY_STEP_ID,
          title: 'S',
          run: async () => {
            order.push(SUMMARY_STEP_ID)
          },
        },
      ]),
      returnIfHitlPaused: () => null,
    })

    expect(order).toEqual([
      PLANNING_STEP_ID,
      TOOL_LOOP_STEP_ID,
      PLANNING_STEP_ID,
      TOOL_LOOP_STEP_ID,
      SUMMARY_STEP_ID,
    ])
  })

  it('evaluates conditional branches when execution reaches the branch point', async () => {
    const order: string[] = []
    const ctx = makeCtx({ stepOutputs: {} })
    const linear: PipelineEntry[] = [
      { id: THINKING_STEP_ID },
      { id: SUMMARY_STEP_ID },
    ]
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 1,
        when: (c) => Boolean(c.stepOutputs.thinking),
        then: [{ id: PLANNING_STEP_ID }],
        else: [],
      },
    ]

    await executeFlowPipeline({
      ctx,
      linear,
      conditionalBranches: branches,
      registry: registryWith([
        {
          id: THINKING_STEP_ID,
          title: 'T',
          run: async ({ flow }) => {
            order.push(THINKING_STEP_ID)
            flow.stepOutputs = { thinking: { raw: 'done' } }
          },
        },
        {
          id: PLANNING_STEP_ID,
          title: 'P',
          run: async () => {
            order.push(PLANNING_STEP_ID)
          },
        },
        {
          id: SUMMARY_STEP_ID,
          title: 'S',
          run: async () => {
            order.push(SUMMARY_STEP_ID)
          },
        },
      ]),
      returnIfHitlPaused: () => null,
    })

    expect(order).toEqual([THINKING_STEP_ID, PLANNING_STEP_ID, SUMMARY_STEP_ID])
    expect(
      resolvedPipelineStageIds(linear, branches, {
        stepOutputs: { thinking: { raw: 'done' } },
      } as never),
    ).toEqual([THINKING_STEP_ID, PLANNING_STEP_ID, SUMMARY_STEP_ID])
  })

  it('throws when goto target is not in the resolved pipeline', async () => {
    const ctx = makeCtx()

    await expect(
      executeFlowPipeline({
        ctx,
        linear: [{ id: PLANNING_STEP_ID }],
        registry: registryWith([
          {
            id: PLANNING_STEP_ID,
            title: 'P',
            run: async ({ flow }) => {
              flow.requestPipelineGoto(SUMMARY_STEP_ID)
            },
          },
        ]),
        returnIfHitlPaused: () => null,
      }),
    ).rejects.toThrow(/else_goto target not found/)
  })
})

describe('findPipelineEntryIndexByStageId', () => {
  it('returns the first matching stage index', () => {
    const entries: PipelineEntry[] = [
      { id: PLANNING_STEP_ID },
      { id: TOOL_LOOP_STEP_ID },
      { id: SUMMARY_STEP_ID },
    ]
    expect(findPipelineEntryIndexByStageId(entries, SUMMARY_STEP_ID)).toBe(2)
    expect(findPipelineEntryIndexByStageId(entries, 'missing' as never)).toBe(-1)
  })
})
