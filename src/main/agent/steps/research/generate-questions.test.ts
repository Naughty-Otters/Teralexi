import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AgentFlowContext } from '../../context'
import { RESEARCH_STEP_ID } from '../../constants/step-ids'
import { ResearchStepContext } from './research-step-context'
import { generateFollowUpQuestions } from './generate-questions'
import type { ResearchFinding, ResolvedResearchConfig } from './config'
import { RESEARCH_LLM } from './research-llm'

vi.mock('../../expr/run-expression-llm', () => ({
  runExpressionLlmText: vi.fn(),
}))

import { runExpressionLlmText } from '../../expr/run-expression-llm'

const baseConfig: ResolvedResearchConfig = {
  topic: 'quantum computing',
  maxRounds: 3,
  maxQuestionsPerRound: 5,
  maxTotalQuestions: 15,
  tools: ['web_search', 'web_scrape'],
}

const findings: ResearchFinding[] = [
  {
    question: 'What is a qubit?',
    output: 'A qubit is a quantum bit.',
    round: 1,
  },
]

function mockResearchCtx(): ResearchStepContext {
  const flow = new AgentFlowContext(
    {
      provider: 'ollama',
      model: 'test',
      systemPrompt: '',
      messages: [{ role: 'user', content: 'quantum' }],
      userId: 'u1',
    },
    {},
  )
  const ctx = new ResearchStepContext(
    flow,
    RESEARCH_STEP_ID,
    'Research',
    'research:test',
  )
  return ctx
}

describe('generateFollowUpQuestions', () => {
  beforeEach(() => {
    vi.mocked(runExpressionLlmText).mockReset()
  })

  it('treats empty LLM output as sufficient', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue('   ')

    const result = await generateFollowUpQuestions(mockResearchCtx(), {
      topic: baseConfig.topic,
      findings,
      researchedKeys: ['what is a qubit?'],
      config: baseConfig,
    })

    expect(result).toEqual({ sufficient: true, questions: [] })
  })

  it('parses follow-up questions from JSON', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      JSON.stringify({
        sufficient: false,
        questions: [
          { question: 'How does entanglement work?', rationale: 'deeper' },
          { question: '  ', rationale: 'skip empty' },
        ],
      }),
    )

    const result = await generateFollowUpQuestions(mockResearchCtx(), {
      topic: baseConfig.topic,
      findings,
      researchedKeys: ['what is a qubit?'],
      config: baseConfig,
    })

    expect(result.sufficient).toBe(false)
    expect(result.questions).toEqual([
      { question: 'How does entanglement work?', rationale: 'deeper' },
    ])
  })

  it('marks sufficient when JSON says sufficient even with questions', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      JSON.stringify({
        sufficient: true,
        questions: [{ question: 'Ignored follow-up' }],
      }),
    )

    const result = await generateFollowUpQuestions(mockResearchCtx(), {
      topic: baseConfig.topic,
      findings,
      researchedKeys: [],
      config: baseConfig,
    })

    expect(result.sufficient).toBe(true)
    expect(result.questions).toHaveLength(1)
  })

  it('treats invalid JSON as sufficient', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue('not json')

    const result = await generateFollowUpQuestions(mockResearchCtx(), {
      topic: baseConfig.topic,
      findings: [],
      researchedKeys: [],
      config: baseConfig,
    })

    expect(result).toEqual({ sufficient: true, questions: [] })
  })

  it('uses custom followUpPrompt as system instructions', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      JSON.stringify({ sufficient: true, questions: [] }),
    )

    await generateFollowUpQuestions(mockResearchCtx(), {
      topic: baseConfig.topic,
      findings,
      researchedKeys: [],
      config: { ...baseConfig, followUpPrompt: 'Custom follow-up system.' },
    })

    expect(runExpressionLlmText).toHaveBeenCalledWith(
      expect.any(ResearchStepContext),
      expect.objectContaining({ instructions: 'Custom follow-up system.' }),
      expect.any(Array),
      expect.objectContaining({ streamToProgress: false }),
    )
  })

  it('includes findings and researched keys in user prompt', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      JSON.stringify({ sufficient: true, questions: [] }),
    )

    await generateFollowUpQuestions(mockResearchCtx(), {
      topic: baseConfig.topic,
      findings,
      researchedKeys: ['what is a qubit?'],
      config: baseConfig,
    })

    const userPrompt = vi.mocked(runExpressionLlmText).mock.calls[0]![1].userPrompt
    expect(userPrompt).toContain(RESEARCH_LLM.FOLLOW_UP_USER)
    expect(userPrompt).toContain('What is a qubit?')
    expect(userPrompt).toContain('what is a qubit?')
  })
})
