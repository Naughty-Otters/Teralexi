import { describe, expect, it } from 'vitest'
import { AgentFlowContext } from '../../context'
import { AgentStepContext } from '../../context'
import { RESEARCH_STEP_ID } from '../../constants/step-ids'
import {
  ResearchStepContext,
  asResearchStepContext,
} from './research-step-context'

describe('ResearchStepContext', () => {
  it('is created by AgentFlowContext.createStepContext for research stage', () => {
    const flow = new AgentFlowContext(
      {
        provider: 'ollama',
        model: 'test',
        systemPrompt: '',
        messages: [],
        userId: 'u1',
      },
      {},
    )
    const ctx = flow.createStepContext(RESEARCH_STEP_ID, 'Research')
    expect(ctx).toBeInstanceOf(ResearchStepContext)
  })

  it('stores resume state on the flow context', () => {
    const flow = new AgentFlowContext(
      {
        provider: 'ollama',
        model: 'test',
        systemPrompt: '',
        messages: [],
        userId: 'u1',
      },
      {},
    )
    const ctx = new ResearchStepContext(
      flow,
      RESEARCH_STEP_ID,
      'Research',
      'research:1',
    )
    ctx.researchResumeState = {
      topic: 'otters',
      findings: [],
      researchedKeys: ['otters'],
      pendingQuestions: [],
      round: 1,
      totalResearched: 1,
    }
    expect(flow.researchResumeState?.topic).toBe('otters')
    ctx.clearResearchResumeState()
    expect(flow.researchResumeState).toBeUndefined()
  })

  it('asResearchStepContext rejects generic AgentStepContext', () => {
    const flow = new AgentFlowContext(
      {
        provider: 'ollama',
        model: 'test',
        systemPrompt: '',
        messages: [],
        userId: 'u1',
      },
      {},
    )
    const generic = new AgentStepContext(
      flow,
      'toolLoop',
      'Tools',
      'toolLoop:1',
    )
    expect(() => asResearchStepContext(generic)).toThrow(/ResearchStepContext/)
  })
})
