import { describe, expect, it } from 'vitest'
import type { AgentFlowContext } from '../../context'
import {
  normalizeResearchQuestion,
  researchConfigFromFlowConfig,
  resolveResearchConfig,
} from './config'

describe('normalizeResearchQuestion', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeResearchQuestion('  How   Do   Qubits  Work?  ')).toBe(
      'how do qubits work?',
    )
  })
})

describe('researchConfigFromFlowConfig', () => {
  it('returns undefined when research block is missing', () => {
    expect(researchConfigFromFlowConfig({})).toBeUndefined()
    expect(researchConfigFromFlowConfig({ research: null })).toBeUndefined()
  })

  it('returns research config when present', () => {
    expect(
      researchConfigFromFlowConfig({
        research: { topic: 'otters', maxRounds: 2 },
      }),
    ).toEqual({ topic: 'otters', maxRounds: 2 })
  })
})

describe('resolveResearchConfig', () => {
  it('applies defaults when config is undefined', () => {
    const flow = {
      getLatestUserMessageContent: () => '  user topic  ',
    } as AgentFlowContext

    expect(resolveResearchConfig(undefined, flow)).toEqual({
      topic: 'user topic',
      maxRounds: 3,
      maxQuestionsPerRound: 5,
      maxTotalQuestions: 15,
      tools: ['web_search', 'web_scrape'],
      gatherPrompt: undefined,
      followUpPrompt: undefined,
    })
  })

  it('prefers explicit topic and trims optional prompts', () => {
    const resolved = resolveResearchConfig(
      {
        topic: ' quantum ',
        maxRounds: 5,
        maxQuestionsPerRound: 2,
        maxTotalQuestions: 8,
        tools: ['web_search'],
        gatherPrompt: '  custom gather  ',
        followUpPrompt: '  custom follow-up  ',
      },
      'fallback topic',
    )

    expect(resolved).toEqual({
      topic: 'quantum',
      maxRounds: 5,
      maxQuestionsPerRound: 2,
      maxTotalQuestions: 8,
      tools: ['web_search'],
      gatherPrompt: 'custom gather',
      followUpPrompt: 'custom follow-up',
    })
  })

  it('uses string topic fallback when config topic is empty', () => {
    expect(resolveResearchConfig({ topic: '  ' }, 'from string')).toEqual(
      expect.objectContaining({ topic: 'from string' }),
    )
    expect(resolveResearchConfig(undefined, undefined).topic).toBe('')
  })
})
