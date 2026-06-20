import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AgentFlowContext } from '../../context'
import { RESEARCH_STEP_ID } from '../../constants/step-ids'
import { ResearchStepContext } from './research-step-context'
import { gatherEvidence } from './gather-evidence'
import type { ResolvedResearchConfig } from './config'
import { RESEARCH_LLM } from './research-llm'

vi.mock('../../expr/tool-loop-expr', () => ({
  executeTodoToolLoop: vi.fn(),
}))

import { executeTodoToolLoop } from '../../expr/tool-loop-expr'

const baseConfig: ResolvedResearchConfig = {
  topic: 'quantum computing',
  maxRounds: 3,
  maxQuestionsPerRound: 5,
  maxTotalQuestions: 15,
  tools: ['web_search', 'web_scrape'],
}

function mockResearchCtx(): ResearchStepContext {
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
  return new ResearchStepContext(
    flow,
    RESEARCH_STEP_ID,
    'Research',
    'research:test',
  )
}

describe('gatherEvidence', () => {
  beforeEach(() => {
    vi.mocked(executeTodoToolLoop).mockReset()
  })

  it('returns trimmed tool-loop output', async () => {
    vi.mocked(executeTodoToolLoop).mockResolvedValue({
      output: '  concrete facts with URLs  ',
      awaitingToolApproval: false,
    } as never)

    const result = await gatherEvidence(
      mockResearchCtx(),
      'What is superposition?',
      baseConfig,
      1,
      baseConfig.topic,
    )

    expect(result).toEqual({
      question: 'What is superposition?',
      output: 'concrete facts with URLs',
      awaitingToolApproval: false,
    })
    expect(executeTodoToolLoop).toHaveBeenCalledWith(
      expect.any(ResearchStepContext),
      expect.objectContaining({
        todoItem: expect.objectContaining({
          id: 1,
          name: expect.stringContaining('Research:'),
          description: expect.stringContaining('What is superposition?'),
        }),
        plan: expect.objectContaining({ finalGoal: baseConfig.topic }),
      }),
    )
  })

  it('propagates awaitingToolApproval and empty output', async () => {
    vi.mocked(executeTodoToolLoop).mockResolvedValue({
      output: '   ',
      awaitingToolApproval: true,
    } as never)

    const result = await gatherEvidence(
      mockResearchCtx(),
      'Need approval',
      baseConfig,
      2,
      baseConfig.topic,
    )

    expect(result.output).toBe('')
    expect(result.awaitingToolApproval).toBe(true)
  })

  it('uses custom gatherPrompt in synthetic todo description', async () => {
    vi.mocked(executeTodoToolLoop).mockResolvedValue({
      output: 'ok',
      awaitingToolApproval: false,
    } as never)

    await gatherEvidence(
      mockResearchCtx(),
      'Short question',
      { ...baseConfig, gatherPrompt: 'Use only peer-reviewed sources.' },
      3,
      baseConfig.topic,
    )

    const call = vi.mocked(executeTodoToolLoop).mock.calls[0]![1] as {
      todoItem: { description: string }
    }
    expect(call.todoItem.description).toContain('Use only peer-reviewed sources.')
  })

  it('truncates long questions in todo name and uses default gather hint', async () => {
    vi.mocked(executeTodoToolLoop).mockResolvedValue({
      output: 'ok',
      awaitingToolApproval: false,
    } as never)

    const longQuestion = 'Q'.repeat(120)
    await gatherEvidence(mockResearchCtx(), longQuestion, baseConfig, 4, baseConfig.topic)

    const call = vi.mocked(executeTodoToolLoop).mock.calls[0]![1] as {
      todoItem: { name: string; description: string }
    }
    expect(call.todoItem.name.length).toBeLessThan(longQuestion.length + 20)
    expect(call.todoItem.description).toContain(RESEARCH_LLM.GATHER_HINT)
  })
})
