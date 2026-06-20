import { describe, expect, it, vi, beforeEach } from 'vitest'
import { normalizePlanningOutput } from '../utils/agent-parsing'
import type { PlanningResult, TodoItem } from '../types'
import {
  defaultPlanningTodoItems,
  ishasTodoItemsPreset,
} from './foreach-item-config'
import { buildSkillsToolExecutorInstructions } from '../constants/skills-tool-llm'
import { buildTodoStepGoalFromPlan } from './step-helpers'

const executeTodoMock = vi.fn(async () => ({
  output: 'mock output',
  awaitingToolApproval: false,
}))
let batchStepCtx: { stepOutputs: { planning?: PlanningResult } } | undefined

vi.mock('./agent-step', () => ({
  AgentStep: class AgentStep {
    constructor(protected ctx: unknown) {}
  },
}))

vi.mock('../expr/tool-loop-expr', () => ({
  executeTodoToolLoop: (ctx: unknown, ...args: unknown[]) => {
    batchStepCtx = ctx as { stepOutputs: { planning?: PlanningResult } }
    return executeTodoMock(ctx, ...args)
  },
  publishToolLoopAttachmentsForParent: vi.fn(),
  toolLoopStageShouldRun: () => true,
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

import { ForEachItemOrchestrator } from './foreach-item-step'

/** Simulates planning LLM JSON (prior pipeline node output). */
const PLANNING_NODE_JSON = JSON.stringify({
  finalGoal: 'Deliver a ranked quote report for the user',
  expectations: [
    'Every planned todo completes successfully',
    'Final artifacts match the skill report format',
  ],
  todoList: [
    {
      name: 'Scrape homepage tags',
      description:
        'Fetch quotes.toscrape.com and write top ten tags to top-tags-today.md',
      success_criteria:
        'output/toolLoop/<step>/results/top-tags-today.md lists at least ten tags',
      fallback_plan: 'retry',
    },
    {
      name: 'Sort quote matches',
      description: 'Run scripts/sort_script.py on quotes-raw.json',
      success_criteria: 'quotes-sorted.json exists with ranked entries',
      fallback_plan: 'retry',
    },
  ],
})

function planningResultFromPriorNode(): PlanningResult {
  const normalized = normalizePlanningOutput(JSON.parse(PLANNING_NODE_JSON))
  const todoList: TodoItem[] = normalized.todoItems.map((item, index) => ({
    id: index + 1,
    name: item.name,
    description: item.description,
    success_criteria: item.success_criteria,
    fallback_plan: item.fallback_plan,
    status: 'pending' as const,
    reference_doc: item.reference_doc,
    reference_scripts: item.reference_scripts,
  }))
  return {
    finalGoal: normalized.finalGoal,
    expectations: normalized.expectations,
    todoList,
    raw: `Goal: ${normalized.finalGoal}`,
  }
}

function makeFormMock() {
  return {
    applyCollectFormResponsesToUiMessages: vi.fn(),
    maybePauseForFormBeforeTodoExecution: vi.fn(async () => false),
    formValuesProvidedByClientRequest: vi.fn(() => false),
    referenceDocIsCollectFormSchemaDoc: vi.fn(() => false),
  }
}

function makeFlowParent(plan: PlanningResult, foreachItem: object) {
  const form = makeFormMock()
  const parent = {
    stepOutputs: { planning: plan },
    hitlAwaitingApproval: false,
    hitlAwaitingFormData: false,
    executionSteps: {
      planning: 'Plan from skill',
      toolLoop: { tools: [{ name: 'read_file' }] },
    },
    opts: { skillId: 'multi-step-quote-test', clientUiMessages: undefined },
    config: { todoStatusIcon: () => '\u23f3' },
    flowStepConfig: { foreachItem },
    form,
    collectedFormByTodoId: {},
    approvalResumeTodoIndex: undefined,
    beginStep: vi.fn(),
    setHitlPausedAtStage: vi.fn(),
    recordStepOutput: vi.fn(),
    emitStepProgress: vi.fn(),
    rebuildStepOutputsFromHistory: vi.fn(),
    buildToolLoopOutputDigest: vi.fn(() => ''),
    updateStepOutput: vi.fn(),
    appendAssistantTurn: vi.fn(),
    getToolLoopAttachmentsForTodo: vi.fn(() => []),
    mergeToolLoopAttachmentsIntoParent: vi.fn(),
    createStepContext: vi.fn(function (this: unknown) {
      return this
    }),
    sandbox: {
      materializePlanningReferences: vi.fn(async () => undefined),
    },
  }
  Object.defineProperty(parent, 'agentFlow', {
    get() {
      return this
    },
    enumerable: true,
  })
  return parent
}

describe('planning node todo list → forEachItem goals', () => {
  beforeEach(() => {
    executeTodoMock.mockClear()
    batchStepCtx = undefined
  })

  it('parses prior planning JSON into todo rows with name, description, and success_criteria', () => {
    const plan = planningResultFromPriorNode()
    expect(plan.todoList).toHaveLength(2)
    expect(plan.todoList[0]).toMatchObject({
      id: 1,
      name: 'Scrape homepage tags',
      description: expect.stringContaining('quotes.toscrape.com'),
      success_criteria: expect.stringContaining('top-tags-today.md'),
    })
    expect(plan.todoList[1]?.name).toBe('Sort quote matches')
  })

  it('defaultPlanningTodoItems reads the same list for foreach iteration', () => {
    const plan = planningResultFromPriorNode()
    const items = defaultPlanningTodoItems({
      stepOutputs: { planning: plan },
    } as never)
    expect(items).toBe(plan.todoList)
    expect(items).toHaveLength(2)
  })

  it('builds distinct executor step goals per foreach index from planning.todoList', () => {
    const plan = planningResultFromPriorNode()
    const goals = plan.todoList.map((todo, index) =>
      buildTodoStepGoalFromPlan(plan, todo, index),
    )

    expect(goals[0]).toContain('Task: Scrape homepage tags')
    expect(goals[0]).toContain('Description: Fetch quotes.toscrape.com')
    expect(goals[0]).toContain('Success criteria:')
    expect(goals[0]).toContain('top-tags-today.md')

    expect(goals[1]).toContain('Task: Sort quote matches')
    expect(goals[1]).toContain('sort_script.py')
    expect(goals[0]).not.toEqual(goals[1])
  })

  it('injects each resolved goal into executor system instructions', () => {
    const plan = planningResultFromPriorNode()
    const stepGoal = buildTodoStepGoalFromPlan(plan, plan.todoList[0]!, 0)
    const instructions = buildSkillsToolExecutorInstructions({
      stepGoal,
      attempt: 1,
      maxAttempts: 3,
      lastRetryContext: '',
      previousStepBlock: '',
      sandboxBlock: '',
      referencesContent: '',
    })

    expect(instructions).toContain('Step goal:')
    expect(instructions).toContain('Task: Scrape homepage tags')
    expect(instructions).not.toContain('<short task name>')
  })

  it('custom forEachItem iterates planning todos and resolves goals per index', async () => {
    const plan = planningResultFromPriorNode()
    const captured: { index: number; goal: string; taskName: string }[] = []

    const parent = makeFlowParent(plan, {
      itemsFrom: defaultPlanningTodoItems,
      runItem: async (_stepCtx, item, index) => {
        const todo = item as TodoItem
        captured.push({
          index,
          goal: buildTodoStepGoalFromPlan(plan, todo, index),
          taskName: todo.name,
        })
      },
    })

    await new ForEachItemOrchestrator(parent as never).execute()

    expect(captured).toHaveLength(2)
    expect(captured[0]).toMatchObject({
      index: 0,
      taskName: 'Scrape homepage tags',
    })
    expect(captured[1]).toMatchObject({
      index: 1,
      taskName: 'Sort quote matches',
    })
    expect(captured[0]!.goal).toContain('Scrape homepage tags')
    expect(captured[1]!.goal).toContain('Sort quote matches')
    expect(executeTodoMock).not.toHaveBeenCalled()
  })

  it('hasTodoItems preset orchestrates per-todo execution starting at startIndex', async () => {
    const plan = planningResultFromPriorNode()
    const config = { preset: 'hasTodoItems' as const, startIndex: 1 }
    expect(ishasTodoItemsPreset(config)).toBe(true)

    const parent = makeFlowParent(plan, config)
    await new ForEachItemOrchestrator(parent as never).execute()

    expect(executeTodoMock).toHaveBeenCalledTimes(1)
    expect(executeTodoMock.mock.calls[0][1]).toMatchObject({
      todoIndexInPlan: 1,
      attempt: 1,
    })

    const goalAtResumeIndex = buildTodoStepGoalFromPlan(
      plan,
      plan.todoList[1]!,
      1,
    )
    expect(goalAtResumeIndex).toContain('Task: Sort quote matches')
    expect(goalAtResumeIndex).toContain('quotes-sorted.json')
  })
})
