import { describe, expect, it } from 'vitest'
import {
  activeStepProgressPartKey,
  agentStepProgressShouldBeOpen,
  excludeSubAgentStepProgressParts,
  isPerTaskForeachItemProgress,
  isPerTaskToolLoopProgress,
  isSubAgentStepProgressPart,
  messageHasRunningStep,
} from './stepProgressDisplay'

describe('stepProgressDisplay', () => {
  it('flags per-todo agentic run progress for hiding', () => {
    expect(
      isPerTaskToolLoopProgress({
        stepId: 'toolLoop',
        title: 'Agentic Run Task 2 Attempt 1',
      }),
    ).toBe(true)
    expect(
      isPerTaskToolLoopProgress({
        stepId: 'toolLoop',
        title: 'Tool Loop Task 2 Attempt 1',
      }),
    ).toBe(true)
    expect(
      isPerTaskToolLoopProgress({ stepId: 'toolLoop', title: 'Agentic Run' }),
    ).toBe(false)
  })

  it('identifies sub-agent step progress by parentRunId', () => {
    const parentPart = {
      id: 'toolLoop-root',
      data: { stepId: 'toolLoop', title: 'Agentic Run', sequence: 4 },
    }
    const childPart = {
      id: 'toolLoop-child',
      data: {
        stepId: 'toolLoop',
        title: 'Agentic Run',
        sequence: 5,
        parentRunId: 'root-1',
        runId: 'sub-1',
      },
    }
    expect(isSubAgentStepProgressPart(parentPart)).toBe(false)
    expect(isSubAgentStepProgressPart(childPart)).toBe(true)
    expect(excludeSubAgentStepProgressParts([parentPart, childPart])).toEqual([
      parentPart,
    ])
  })

  const parts = [
    {
      id: 'thinking-1',
      data: { stepId: 'thinking', sequence: 1, status: 'completed' },
    },
    {
      id: 'planning-2',
      data: { stepId: 'planning', sequence: 2, status: 'running' },
    },
  ] as const

  it('detects running steps', () => {
    expect(messageHasRunningStep([...parts])).toBe(true)
    expect(
      messageHasRunningStep([
        { id: 'thinking-1', data: { status: 'completed', sequence: 1 } },
      ]),
    ).toBe(false)
  })

  it('picks the latest running step as active', () => {
    expect(activeStepProgressPartKey([...parts])).toBe('planning-2')
  })

  it('opens only the active step while running (accordion)', () => {
    expect(
      agentStepProgressShouldBeOpen([...parts], parts[0], { debugMode: true }),
    ).toBe(false)
    expect(
      agentStepProgressShouldBeOpen([...parts], parts[1], { debugMode: true }),
    ).toBe(true)
  })

  it('keeps the visible step open in compact mode after completion', () => {
    const done = [
      {
        id: 'thinking-1',
        data: { stepId: 'thinking', sequence: 1, status: 'completed' },
      },
      {
        id: 'toolLoop-2',
        data: { stepId: 'toolLoop', sequence: 2, status: 'completed' },
      },
    ] as const
    expect(agentStepProgressShouldBeOpen([...done], done[1], { debugMode: false })).toBe(
      true,
    )
    expect(agentStepProgressShouldBeOpen([...done], done[1], { debugMode: true })).toBe(
      false,
    )
  })
})
