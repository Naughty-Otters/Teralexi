import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../coding/plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => false),
}))

import { isPlanModeActive } from '../coding/plan-mode-state'
import {
  latestThinkingStepData,
  thinkingWantsAgentCall,
  thinkingWantsDirectAnswer,
  thinkingWantsPlanning,
  thinkingWantsResearch,
} from './thinking-utils'

describe('thinking-utils', () => {
  beforeEach(() => {
    vi.mocked(isPlanModeActive).mockReturnValue(false)
  })

  it('thinkingWantsDirectAnswer when mode is direct_answer', () => {
    const ctx = {
      opts: { conversationId: 'conv-1' },
      stepOutputs: {
        thinking: {
          raw: 'x',
          execution_mode: 'direct_answer' as const,
          goal: 'g',
          response: 'answer',
        },
      },
    }
    expect(thinkingWantsDirectAnswer(ctx)).toBe(true)
    expect(thinkingWantsPlanning(ctx)).toBe(false)
    expect(thinkingWantsAgentCall(ctx)).toBe(false)
  })

  it('thinkingWantsDirectAnswer is false when plan mode is already active', () => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    expect(
      thinkingWantsDirectAnswer({
        opts: { conversationId: 'conv-1' },
        stepOutputs: {
          thinking: {
            raw: 'x',
            execution_mode: 'direct_answer',
            goal: 'g',
            response: 'answer',
          },
        },
      }),
    ).toBe(false)
  })

  it('thinkingWantsPlanning when mode is planning', () => {
    expect(
      thinkingWantsPlanning({
        stepOutputs: {
          thinking: {
            raw: 'x',
            execution_mode: 'planning',
            goal: 'g',
          },
        },
      }),
    ).toBe(true)
  })

  it('thinkingWantsPlanning when plan mode is already active', () => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    expect(
      thinkingWantsPlanning({
        opts: { conversationId: 'conv-1' },
        stepOutputs: {
          thinking: {
            raw: 'x',
            execution_mode: 'agent_call',
            goal: 'g',
          },
        },
      }),
    ).toBe(true)
  })

  it('sub-agent runs always want agent_call even when plan mode is active', () => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    const ctx = {
      opts: { conversationId: 'conv-1' },
      agentRun: { meta: { depth: 1 } },
      stepOutputs: {
        thinking: {
          raw: 'x',
          execution_mode: 'planning',
          goal: 'g',
        },
      },
    }
    expect(thinkingWantsPlanning(ctx)).toBe(false)
    expect(thinkingWantsAgentCall(ctx)).toBe(true)
  })

  it('thinkingWantsAgentCall for agent_call or missing mode', () => {
    expect(
      thinkingWantsAgentCall({
        stepOutputs: {
          thinking: { raw: 'x', execution_mode: 'agent_call', goal: 'g' },
        },
      }),
    ).toBe(true)
    expect(thinkingWantsAgentCall({ stepOutputs: {} })).toBe(true)
  })

  it('deprecated research helper still returns false', () => {
    expect(
      thinkingWantsResearch({
        raw: 'x',
        execution_mode: 'research',
        goal: 'g',
      }),
    ).toBe(false)
  })

  it('latestThinkingStepData reads response field', () => {
    const data = latestThinkingStepData({
      stepOutputs: {
        thinking: {
          raw: 'digest',
          execution_mode: 'direct_answer',
          goal: 'g',
          response: 'Hi there',
        },
      },
    })
    expect(data?.response).toBe('Hi there')
  })
})
