import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockExecuteTodo } = vi.hoisted(() => ({
  mockExecuteTodo: vi.fn(async () => ({
    output: 'done',
    awaitingToolApproval: false,
  })),
}))

vi.mock('./agent-step', () => ({
  AgentStep: class AgentStep {
    constructor(protected ctx: unknown) {}
  },
}))

vi.mock('../expr/tool-loop-expr', () => ({
  executeTodoToolLoop: mockExecuteTodo,
  toolLoopStageShouldRun: () => true,
  publishToolLoopAttachmentsForParent: vi.fn(),
}))

vi.mock('./todo-execution-types', () => ({
  verifyTodoResult: vi.fn(async () => ({ valid: true, summary: 'ok' })),
}))

vi.mock('../form/todo-form-readiness', () => ({
  assessTodoFormReadiness: vi.fn(async () => ({
    sufficient: true,
    collectViaForm: false,
  })),
}))

import { StepOutputStore } from './step-output-store'
import type { ThinkingStepData } from './step-io'
import { THINKING_STEP_ID } from '../constants/step-ids'
import { ForEachItemOrchestrator } from './foreach-item-step'

function makeParent(overrides: Record<string, unknown> = {}) {
  const parent = {
    stepOutputs: {},
    hitlAwaitingApproval: false,
    hitlAwaitingFormData: false,
    setHitlPausedAtStage: vi.fn(),
    executionSteps: {
      planning: 'p',
      toolLoop: { tools: [{ name: 'read_file' }] },
    },
    opts: { skillId: 's' },
    config: { todoStatusIcon: () => '⏳' },
    getToolLoopAttachmentsForTodo: vi.fn(() => []),
    mergeToolLoopAttachmentsIntoParent: vi.fn(),
    ...overrides,
  }
  Object.defineProperty(parent, 'agentFlow', {
    get() {
      return this
    },
    enumerable: true,
  })
  return parent
}

function makeFormMock() {
  return {
    applyCollectFormResponsesToUiMessages: vi.fn(),
    maybePauseForFormBeforeTodoExecution: vi.fn(async () => false),
    formValuesProvidedByClientRequest: vi.fn(() => false),
    referenceDocIsCollectFormSchemaDoc: vi.fn(() => false),
  }
}

function makeSandboxMock() {
  return {
    getRoot: () => '/',
    buildInstructionBlock: () => '',
    buildSandboxStructureBlock: () => '',
    buildWorkspaceStructureBlock: () => '',
    materializePlanningReferences: vi.fn(async () => undefined),
  }
}

function makeStepContextFromParent(parent: Record<string, unknown>) {
  const form = makeFormMock()
  const ctx = {
    ...parent,
    form,
    collectedFormByTodoId: {},
    approvalResumeTodoIndex: undefined,
    opts: { skillId: 's', clientUiMessages: undefined },
    getToolLoopAttachmentsForTodo:
      (parent.getToolLoopAttachmentsForTodo as () => unknown) ??
      vi.fn(() => []),
    references: { ensureReferenceDoc: vi.fn(), ensureReferenceScript: vi.fn() },
    sandbox: makeSandboxMock(),
    model: 'test-model',
    beginStep: vi.fn(),
    emitStepProgress: vi.fn(),
    emitBatchToolLoopStepProgress: vi.fn(),
    recordStepOutput: vi.fn(),
    appendAssistantTurn: vi.fn(),
    hitlAwaitingApproval: false,
    hitlAwaitingFormData: false,
    setHitlPausedAtStage: vi.fn(),
    runtimeTools: [{ name: 'read_file', source: 'skill' }],
  }
  Object.defineProperty(ctx, 'agentFlow', {
    get() {
      return this
    },
    enumerable: true,
  })
  return ctx
}

describe('ForEachItemOrchestrator', () => {
  beforeEach(() => {
    mockExecuteTodo.mockClear()
  })

  it('shouldRun is false without foreachItem config', () => {
    const step = new ForEachItemOrchestrator(makeParent() as never)
    expect(step.shouldRun()).toBe(false)
  })

  it('shouldRun is false for hasTodoItems when todo list empty', () => {
    const step = new ForEachItemOrchestrator(
      makeParent({
        flowStepConfig: { foreachItem: { preset: 'hasTodoItems' } },
        stepOutputs: { planning: { finalGoal: 'g', todoList: [] } },
      }) as never,
    )
    expect(step.shouldRun()).toBe(false)
  })

  it('shouldRun is true for hasTodoItems with todos and tool work', () => {
    const step = new ForEachItemOrchestrator(
      makeParent({
        flowStepConfig: { foreachItem: { preset: 'hasTodoItems' } },
        stepOutputs: {
          planning: {
            finalGoal: 'g',
            todoList: [{ id: 1, name: 'A', status: 'pending' }],
          },
        },
      }) as never,
    )
    expect(step.shouldRun()).toBe(true)
  })

  it('runs custom runItem for each item', async () => {
    const runItem = vi.fn(async () => undefined)
    const parent = makeParent()
    const ctx = {
      ...parent,
      flowStepConfig: {
        foreachItem: {
          itemsFrom: () => [{ id: 1 }, { id: 2 }],
          runItem,
        },
      },
      beginStep: vi.fn(),
      recordStepOutput: vi.fn(),
      createStepContext: vi.fn((_id: string, _title: string, config: unknown) => ({
        ...parent,
        flowStepConfig: config,
        beginStep: vi.fn(),
        recordStepOutput: vi.fn(),
        hitlAwaitingApproval: false,
        hitlAwaitingFormData: false,
        setHitlPausedAtStage: vi.fn(),
      })),
    }

    const step = new ForEachItemOrchestrator(ctx as never)
    await step.execute()
    expect(runItem).toHaveBeenCalledTimes(2)
    expect(mockExecuteTodo).not.toHaveBeenCalled()
  })

  it('respects startIndex for custom items', async () => {
    const runItem = vi.fn(async () => undefined)
    const parent = makeParent()
    const ctx = {
      ...parent,
      flowStepConfig: {
        foreachItem: {
          itemsFrom: () => [{ id: 0 }, { id: 1 }, { id: 2 }],
          startIndex: 2,
          runItem,
        },
      },
      beginStep: vi.fn(),
      recordStepOutput: vi.fn(),
      createStepContext: vi.fn(() => ({
        ...parent,
        beginStep: vi.fn(),
        recordStepOutput: vi.fn(),
        hitlAwaitingApproval: false,
        hitlAwaitingFormData: false,
        setHitlPausedAtStage: vi.fn(),
      })),
    }

    await new ForEachItemOrchestrator(ctx as never).execute()
    expect(runItem).toHaveBeenCalledTimes(1)
    expect(runItem.mock.calls[0][2]).toBe(2)
  })

  it('skips items when shouldRunItem returns false', async () => {
    const runItem = vi.fn(async () => undefined)
    const parent = makeParent()
    const ctx = {
      ...parent,
      flowStepConfig: {
        foreachItem: {
          itemsFrom: () => [1, 2, 3],
          shouldRunItem: (_item: unknown, index: number) => index !== 1,
          runItem,
        },
      },
      beginStep: vi.fn(),
      recordStepOutput: vi.fn(),
      createStepContext: vi.fn(() => ({
        ...parent,
        beginStep: vi.fn(),
        recordStepOutput: vi.fn(),
        hitlAwaitingApproval: false,
        hitlAwaitingFormData: false,
        setHitlPausedAtStage: vi.fn(),
      })),
    }

    await new ForEachItemOrchestrator(ctx as never).execute()
    expect(runItem).toHaveBeenCalledTimes(2)
  })

  it('stops iteration when HITL is set mid-loop', async () => {
    const runItem = vi.fn(async (_stepCtx: unknown, _item: unknown, index: number) => {
      if (index === 0) {
        ctx.hitlAwaitingApproval = true
      }
    })
    const ctx = {
      ...makeParent(),
      hitlAwaitingApproval: false,
      hitlAwaitingFormData: false,
      flowStepConfig: {
        foreachItem: {
          itemsFrom: () => [1, 2, 3],
          runItem,
        },
      },
      beginStep: vi.fn(),
      recordStepOutput: vi.fn(),
      createStepContext: vi.fn(function (this: unknown) {
        return this
      }),
    }

    await new ForEachItemOrchestrator(ctx as never).execute()
    expect(runItem).toHaveBeenCalledTimes(1)
  })

  it('shouldRun is true for hasTodoItems with agent_call thinking only (no planning)', () => {
    const step = new ForEachItemOrchestrator(
      makeParent({
        flowStepConfig: { foreachItem: { preset: 'hasTodoItems' } },
        stepOutputs: {
          thinking: {
            raw: '**Mode:** Agent call',
            execution_mode: 'agent_call',
            goal: 'Deploy app',
            task: 'Run deploy script once',
            context: ['env: prod'],
          },
        },
      }) as never,
    )
    expect(step.shouldRun()).toBe(true)
  })

  it('hasTodoItems preset orchestrates todo execution', async () => {
    const form = makeFormMock()
    const ctx = {
      ...makeParent({
        stepOutputs: {
          planning: {
            finalGoal: 'goal',
            todoList: [
              { id: 1, name: 'Step 1', description: 'do it', success_criteria: 'done', fallback_plan: 'skip', status: 'pending', reference_doc: [] },
            ],
          },
        },
      }),
      skillId: 's',
      sandbox: makeSandboxMock(),
      flowStepConfig: { foreachItem: { preset: 'hasTodoItems', startIndex: 0 } },
      form,
      beginStep: vi.fn(),
      emitStepProgress: vi.fn(),
      emitBatchToolLoopStepProgress: vi.fn(),
      rebuildStepOutputsFromHistory: vi.fn(),
      buildToolLoopOutputDigest: vi.fn(() => ''),
      updateStepOutput: vi.fn(),
      appendAssistantTurn: vi.fn(),
      createStepContext: vi.fn(function (this: unknown) {
        return makeStepContextFromParent(this as Record<string, unknown>)
      }),
    }

    await new ForEachItemOrchestrator(ctx as never).execute()
    expect(mockExecuteTodo).toHaveBeenCalledTimes(1)
    expect(mockExecuteTodo.mock.calls[0][1]).toMatchObject({
      todoItem: expect.objectContaining({ id: 1 }),
      todoIndexInPlan: 0,
      attempt: 1,
      route: 'normal',
    })
  })

  it('no-ops execute when config missing', async () => {
    const step = new ForEachItemOrchestrator(makeParent() as never)
    await expect(step.execute()).resolves.toBeUndefined()
  })
})
