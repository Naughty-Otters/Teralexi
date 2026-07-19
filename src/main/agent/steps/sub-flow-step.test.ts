import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SUB_FLOW_STEP_ID } from '../constants/step-ids'
import { subFlowFlowStepDefinition } from './sub-flow-step'
import type { StepOutputEntry } from './step-io'

vi.mock('../run/resolve-child-agent', () => ({
  resolveEngineAgent: vi.fn(),
  formatSubFlowStepTitle: vi.fn(() => 'Child Agent'),
  mergeSubFlowOutputText: vi.fn(() => 'merged child output'),
  resolveSubAgentSummaryText: vi.fn(() => 'merged child output'),
}))

import {
  formatSubFlowStepTitle,
  mergeSubFlowOutputText,
  resolveEngineAgent,
  resolveSubAgentSummaryText,
} from '../run/resolve-child-agent'

const sampleEntry: StepOutputEntry = {
  stepId: SUB_FLOW_STEP_ID,
  instanceKey: 'subFlow:1',
  timestamp: new Date().toISOString(),
  data: { agentId: 'skill:child', output: '  child result  ' },
}

function makeRun(overrides: Record<string, unknown> = {}) {
  const createStepContext = vi.fn(() => ({
    beginStep: vi.fn(),
    stepInstanceKey: 'subFlow:ctx',
  }))
  const recordStepOutput = vi.fn()
  const appendAssistantTurn = vi.fn()
  const buildPipelineContextMessages = vi.fn(() => [
    { role: 'user', content: 'prior context' },
  ])
  const executeChildAndMerge = vi.fn(async () => ({
    stepOutputs: { report: { report: 'child report' } },
    hitlPaused: false,
  }))

  const flow = {
    getLatestUserMessageContent: () => 'latest user task',
    buildPipelineContextMessages,
    createStepContext,
    recordStepOutput,
    appendAssistantTurn,
    agentRun: { executeChildAndMerge },
    opts: { userId: 'u1' },
    hitlAwaitingApproval: false,
    ...overrides,
  }

  return {
    flow,
    createStepContext,
    recordStepOutput,
    appendAssistantTurn,
    executeChildAndMerge,
    buildPipelineContextMessages,
  }
}

describe('subFlowFlowStepDefinition', () => {
  beforeEach(() => {
    vi.mocked(resolveEngineAgent).mockReset()
    vi.mocked(formatSubFlowStepTitle).mockClear()
    vi.mocked(mergeSubFlowOutputText).mockClear()
    vi.mocked(resolveSubAgentSummaryText).mockClear()
    vi.mocked(resolveEngineAgent).mockResolvedValue({
      id: 'skill:child',
      name: 'Child',
    } as never)
  })

  it('shouldRun requires a non-empty agentId', () => {
    expect(
      subFlowFlowStepDefinition.shouldRun?.({
        config: { subFlow: { agentId: 'skill:child' } },
      } as never),
    ).toBe(true)
    expect(
      subFlowFlowStepDefinition.shouldRun?.({
        config: { subFlow: { agentId: '  ' } },
      } as never),
    ).toBe(false)
    expect(subFlowFlowStepDefinition.shouldRun?.({ config: {} } as never)).toBe(false)
  })

  it('run delegates to child agent and records merged output', async () => {
    const {
      flow,
      createStepContext,
      recordStepOutput,
      appendAssistantTurn,
      executeChildAndMerge,
      buildPipelineContextMessages,
    } = makeRun()

    await subFlowFlowStepDefinition.run({
      flow,
      config: { subFlow: { agentId: 'skill:child', task: '  do work  ' } },
    } as never)

    expect(resolveEngineAgent).toHaveBeenCalledWith('u1', 'skill:child')
    expect(buildPipelineContextMessages).toHaveBeenCalled()
    expect(createStepContext).toHaveBeenCalled()
    expect(executeChildAndMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'skill:child',
        task: 'do work',
        parentHitlPauseStageId: SUB_FLOW_STEP_ID,
      }),
    )
    expect(mergeSubFlowOutputText).not.toHaveBeenCalled()
    expect(resolveSubAgentSummaryText).toHaveBeenCalled()
    expect(recordStepOutput).toHaveBeenCalledWith(
      SUB_FLOW_STEP_ID,
      'Child Agent',
      expect.objectContaining({ agentId: 'skill:child', output: 'merged child output' }),
      'merged child output',
      { childAgentId: 'skill:child' },
      'subFlow:ctx',
      expect.any(String),
    )
    expect(appendAssistantTurn).toHaveBeenCalledWith('merged child output')
  })

  it('uses latest user message when task is omitted', async () => {
    const { flow, executeChildAndMerge } = makeRun()
    await subFlowFlowStepDefinition.run({
      flow,
      config: { subFlow: { agentId: 'skill:child' } },
    } as never)
    expect(executeChildAndMerge).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'latest user task' }),
    )
  })

  it('returns early when child pauses for HITL', async () => {
    const { flow, recordStepOutput, appendAssistantTurn } = makeRun({
      agentRun: {
        executeChildAndMerge: vi.fn(async () => ({
          stepOutputs: {},
          hitlPaused: true,
        })),
      },
    })

    await subFlowFlowStepDefinition.run({
      flow,
      config: { subFlow: { agentId: 'skill:child' } },
    } as never)

    expect(flow.hitlAwaitingApproval).toBe(true)
    expect(recordStepOutput).not.toHaveBeenCalled()
    expect(appendAssistantTurn).not.toHaveBeenCalled()
  })

  it('throws when no active AgentRun exists', async () => {
    const { flow } = makeRun({ agentRun: undefined })
    await expect(
      subFlowFlowStepDefinition.run({
        flow,
        config: { subFlow: { agentId: 'skill:child' } },
      } as never),
    ).rejects.toThrow(/active AgentRun/)
  })

  it('no-ops when subFlow config is missing', async () => {
    const { flow, executeChildAndMerge } = makeRun()
    await subFlowFlowStepDefinition.run({ flow, config: {} } as never)
    expect(executeChildAndMerge).not.toHaveBeenCalled()
  })

  it('maps outputs to context messages and sub-steps', () => {
    expect(subFlowFlowStepDefinition.hasOutput?.([sampleEntry])).toBe(true)
    expect(subFlowFlowStepDefinition.toContextMessages?.([sampleEntry])).toEqual([
      { role: 'user', content: 'Sub-agent result:\n\nchild result' },
    ])
    expect(subFlowFlowStepDefinition.toSubStep?.([sampleEntry])).toEqual({
      type: 'SkillsToolExecutionStep',
      title: 'Sub-agent',
      content: 'child result',
    })
    expect(subFlowFlowStepDefinition.toStepCapture?.([sampleEntry])).toEqual({
      stepType: 'SkillsToolExecutionStep',
      title: 'Sub-agent',
      content: 'child result',
      outputPaths: [],
    })
    expect(subFlowFlowStepDefinition.toContextMessages?.([])).toEqual([])
  })
})
