import { describe, expect, it, vi } from 'vitest'
import {
  iterateResolvedPipelineEntries,
  resolvedPipelineStageIds,
  type FlowConditionalBranch,
  type PipelineEntry,
} from './pipeline'
import type { AgentFlowContext } from '../context'
import {
  FOREACH_ITEM_STEP_ID,
  PLANNING_STEP_ID,
  PROMPT_STEP_ID,
  REPORT_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'

const linear = (ids: string[]): PipelineEntry[] =>
  ids.map((id) => ({ id: id as PipelineEntry['id'] }))

describe('iterateResolvedPipelineEntries', () => {
  it('inserts branch after linear stages registered before when()', () => {
    const stages = linear([PLANNING_STEP_ID, TOOL_LOOP_STEP_ID])
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 2,
        when: (ctx) => (ctx.stepOutputs.planning?.todoList?.length ?? 0) > 0,
        then: linear([SUMMARY_STEP_ID]),
        else: linear([REPORT_STEP_ID]),
      },
    ]

    const withTodos = {
      stepOutputs: {
        planning: { finalGoal: 'g', todoList: [{ id: 1 }, { id: 2 }] },
      },
    } as AgentFlowContext

    expect(
      resolvedPipelineStageIds(stages, branches, withTodos),
    ).toEqual([PLANNING_STEP_ID, TOOL_LOOP_STEP_ID, SUMMARY_STEP_ID])

    expect(
      resolvedPipelineStageIds(stages, branches, { stepOutputs: {} } as AgentFlowContext),
    ).toEqual([PLANNING_STEP_ID, TOOL_LOOP_STEP_ID, REPORT_STEP_ID])
  })

  it('evaluates branch between planning and tool loop when when() sits between them', () => {
    const stages = linear([PLANNING_STEP_ID, TOOL_LOOP_STEP_ID])
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 1,
        when: () => true,
        then: linear([THINKING_STEP_ID]),
        else: [],
      },
    ]

    const ids = [
      ...iterateResolvedPipelineEntries(stages, branches, () => ({}) as AgentFlowContext),
    ].map((e) => e.id)

    expect(ids).toEqual([PLANNING_STEP_ID, THINKING_STEP_ID, TOOL_LOOP_STEP_ID])
  })

  it('inserts branch before first linear stage when afterLinearIndex is 0', () => {
    const stages = linear([PLANNING_STEP_ID])
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 0,
        when: () => true,
        then: linear([THINKING_STEP_ID]),
        else: [],
      },
    ]

    expect(
      resolvedPipelineStageIds(stages, branches, {} as AgentFlowContext),
    ).toEqual([THINKING_STEP_ID, PLANNING_STEP_ID])
  })

  it('appends end branch when afterLinearIndex equals linear length', () => {
    const stages = linear([PLANNING_STEP_ID])
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 1,
        when: () => false,
        else: linear([REPORT_STEP_ID]),
        then: [],
      },
    ]

    expect(
      resolvedPipelineStageIds(stages, branches, {} as AgentFlowContext),
    ).toEqual([PLANNING_STEP_ID, REPORT_STEP_ID])
  })

  it('handles empty linear pipeline with only a when branch', () => {
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 0,
        when: () => true,
        then: linear([SUMMARY_STEP_ID]),
        else: [],
      },
    ]

    expect(
      resolvedPipelineStageIds([], branches, {} as AgentFlowContext),
    ).toEqual([SUMMARY_STEP_ID])
  })

  it('evaluates branch when getCtx is called at reach time (not upfront)', () => {
    const stages = linear([PLANNING_STEP_ID, TOOL_LOOP_STEP_ID])
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 1,
        when: (ctx) => Boolean(ctx.stepOutputs.planning),
        then: linear([SUMMARY_STEP_ID]),
        else: linear([REPORT_STEP_ID]),
      },
    ]

    const ctx = { stepOutputs: {} } as AgentFlowContext
    const gen = iterateResolvedPipelineEntries(stages, branches, () => ctx)

    expect(gen.next().value?.id).toBe(PLANNING_STEP_ID)
    expect(ctx.stepOutputs.planning).toBeUndefined()

    ctx.stepOutputs = { planning: { finalGoal: 'g', todoList: [] } }
    const branchEntries = [...gen]
    expect(branchEntries.map((e) => e.id)).toEqual([SUMMARY_STEP_ID, TOOL_LOOP_STEP_ID])
  })

  it('runs multiple branches at same afterLinearIndex in registration order', () => {
    const stages = linear([PLANNING_STEP_ID])
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 1,
        when: () => true,
        then: linear([SUMMARY_STEP_ID]),
        else: [],
      },
      {
        afterLinearIndex: 1,
        when: () => true,
        then: linear([REPORT_STEP_ID]),
        else: [],
      },
    ]

    expect(
      resolvedPipelineStageIds(stages, branches, {} as AgentFlowContext),
    ).toEqual([PLANNING_STEP_ID, SUMMARY_STEP_ID, REPORT_STEP_ID])
  })

  it('sorts branches by afterLinearIndex when registered out of order', () => {
    const stages = linear([PLANNING_STEP_ID, TOOL_LOOP_STEP_ID])
    const branches: FlowConditionalBranch[] = [
      {
        afterLinearIndex: 2,
        when: () => true,
        then: linear([REPORT_STEP_ID]),
        else: [],
      },
      {
        afterLinearIndex: 1,
        when: () => true,
        then: linear([THINKING_STEP_ID]),
        else: [],
      },
    ]

    expect(
      resolvedPipelineStageIds(stages, branches, {} as AgentFlowContext),
    ).toEqual([
      PLANNING_STEP_ID,
      THINKING_STEP_ID,
      TOOL_LOOP_STEP_ID,
      REPORT_STEP_ID,
    ])
  })
})
