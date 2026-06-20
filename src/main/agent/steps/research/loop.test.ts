import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AgentFlowContext } from '../../context'
import { RESEARCH_STEP_ID } from '../../constants/step-ids'
import { ResearchStepContext } from './research-step-context'
import { runResearchLoop } from './loop'
import type { ResolvedResearchConfig } from './config'

vi.mock('./gather-evidence', () => ({
  gatherEvidence: vi.fn(),
}))

vi.mock('./generate-questions', () => ({
  generateFollowUpQuestions: vi.fn(),
}))

import { gatherEvidence } from './gather-evidence'
import { generateFollowUpQuestions } from './generate-questions'

const baseConfig: ResolvedResearchConfig = {
  topic: 'quantum computing basics',
  maxRounds: 3,
  maxQuestionsPerRound: 5,
  maxTotalQuestions: 15,
  tools: ['web_search', 'web_scrape'],
}

function mockResearchCtx(
  overrides: Partial<Pick<ResearchStepContext, 'hitlAwaitingApproval'>> = {},
): ResearchStepContext {
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
    'research:test',
  )
  ctx.beginStep = vi.fn() as typeof ctx.beginStep
  ctx.emitStepProgress = vi.fn() as typeof ctx.emitStepProgress
  if (overrides.hitlAwaitingApproval != null) {
    ctx.hitlAwaitingApproval = overrides.hitlAwaitingApproval
  }
  return ctx
}

describe('runResearchLoop', () => {
  beforeEach(() => {
    vi.mocked(gatherEvidence).mockReset()
    vi.mocked(generateFollowUpQuestions).mockReset()
  })

  it('researches initial topic and stops when sufficient', async () => {
    vi.mocked(gatherEvidence).mockResolvedValue({
      question: baseConfig.topic,
      output: 'Found overview articles.',
      awaitingToolApproval: false,
    })
    vi.mocked(generateFollowUpQuestions).mockResolvedValue({
      sufficient: true,
      questions: [],
    })

    const ctx = mockResearchCtx()
    const result = await runResearchLoop(ctx, baseConfig)

    expect(ctx.emitStepProgress).toHaveBeenCalledWith(
      expect.stringContaining('🔍 Research'),
    )
    expect(gatherEvidence).toHaveBeenCalledTimes(1)
    expect(generateFollowUpQuestions).toHaveBeenCalledTimes(1)
    expect(result.findings).toHaveLength(1)
    expect(result.paused).toBe(false)
    expect(result.digestMarkdown).toContain(baseConfig.topic)
  })

  it('runs a second round for follow-up questions', async () => {
    vi.mocked(gatherEvidence)
      .mockResolvedValueOnce({
        question: baseConfig.topic,
        output: 'Round 0 output.',
        awaitingToolApproval: false,
      })
      .mockResolvedValueOnce({
        question: 'How do qubits maintain coherence?',
        output: 'Round 1 output.',
        awaitingToolApproval: false,
      })

    vi.mocked(generateFollowUpQuestions)
      .mockResolvedValueOnce({
        sufficient: false,
        questions: [
          {
            question: 'How do qubits maintain coherence?',
            rationale: 'deeper dive',
          },
        ],
      })
      .mockResolvedValueOnce({
        sufficient: true,
        questions: [],
      })

    const result = await runResearchLoop(mockResearchCtx(), baseConfig)

    expect(gatherEvidence).toHaveBeenCalledTimes(2)
    expect(generateFollowUpQuestions).toHaveBeenCalledTimes(2)
    expect(result.findings).toHaveLength(2)
  })

  it('pauses on tool approval and saves resume state', async () => {
    vi.mocked(gatherEvidence).mockResolvedValue({
      question: baseConfig.topic,
      output: 'partial',
      awaitingToolApproval: true,
    })

    const ctx = mockResearchCtx()
    const result = await runResearchLoop(ctx, baseConfig)

    expect(result.paused).toBe(true)
    expect(ctx.hitlAwaitingApproval).toBe(true)
    expect(ctx.researchResumeState).toBeDefined()
    expect(ctx.researchResumeState?.topic).toBe(baseConfig.topic)
  })

  it('respects maxTotalQuestions', async () => {
    const limitedConfig = { ...baseConfig, maxTotalQuestions: 1 }

    vi.mocked(gatherEvidence).mockResolvedValue({
      question: baseConfig.topic,
      output: 'only one',
      awaitingToolApproval: false,
    })
    vi.mocked(generateFollowUpQuestions).mockResolvedValue({
      sufficient: false,
      questions: [
        {
          question: 'What are error correction codes?',
          rationale: 'more',
        },
      ],
    })

    const result = await runResearchLoop(mockResearchCtx(), limitedConfig)

    expect(gatherEvidence).toHaveBeenCalledTimes(1)
    expect(result.findings).toHaveLength(1)
  })

  it('resumes from saved researchResumeState', async () => {
    vi.mocked(gatherEvidence).mockResolvedValue({
      question: 'Follow-up question',
      output: 'Resumed output.',
      awaitingToolApproval: false,
    })
    vi.mocked(generateFollowUpQuestions).mockResolvedValue({
      sufficient: true,
      questions: [],
    })

    const ctx = mockResearchCtx()
    ctx.researchResumeState = {
      topic: baseConfig.topic,
      findings: [
        { question: 'Initial', output: 'First finding.', round: 1 },
      ],
      researchedKeys: [baseConfig.topic.toLowerCase()],
      pendingQuestions: ['Follow-up question'],
      round: 1,
      totalResearched: 1,
    }

    const result = await runResearchLoop(ctx, baseConfig)

    expect(ctx.researchResumeState).toBeUndefined()
    expect(gatherEvidence).toHaveBeenCalledTimes(1)
    expect(result.findings).toHaveLength(2)
    expect(result.findings[1]?.question).toBe('Follow-up question')
  })

  it('skips already researched questions in the same batch', async () => {
    vi.mocked(gatherEvidence).mockResolvedValue({
      question: 'fresh question',
      output: 'new output',
      awaitingToolApproval: false,
    })
    vi.mocked(generateFollowUpQuestions).mockResolvedValue({
      sufficient: true,
      questions: [],
    })

    const ctx = mockResearchCtx()
    ctx.researchResumeState = {
      topic: baseConfig.topic,
      findings: [],
      researchedKeys: ['duplicate question'],
      pendingQuestions: ['Duplicate   Question', 'fresh question'],
      round: 0,
      totalResearched: 1,
    }

    const result = await runResearchLoop(ctx, baseConfig)

    expect(gatherEvidence).toHaveBeenCalledTimes(1)
    expect(gatherEvidence).toHaveBeenCalledWith(
      ctx,
      'fresh question',
      baseConfig,
      2,
      baseConfig.topic,
    )
    expect(result.findings).toHaveLength(1)
  })

  it('stops mid-batch when maxTotalQuestions is reached', async () => {
    vi.mocked(gatherEvidence).mockResolvedValue({
      question: 'first',
      output: 'first output',
      awaitingToolApproval: false,
    })

    const ctx = mockResearchCtx()
    ctx.researchResumeState = {
      topic: baseConfig.topic,
      findings: [],
      researchedKeys: [],
      pendingQuestions: ['first question', 'second question'],
      round: 0,
      totalResearched: 0,
    }

    const result = await runResearchLoop(ctx, {
      ...baseConfig,
      maxTotalQuestions: 1,
    })

    expect(gatherEvidence).toHaveBeenCalledTimes(1)
    expect(result.findings).toHaveLength(1)
    expect(generateFollowUpQuestions).not.toHaveBeenCalled()
  })

  it('records placeholder output when gather returns empty text', async () => {
    vi.mocked(gatherEvidence).mockResolvedValue({
      question: baseConfig.topic,
      output: '',
      awaitingToolApproval: false,
    })
    vi.mocked(generateFollowUpQuestions).mockResolvedValue({
      sufficient: true,
      questions: [],
    })

    const result = await runResearchLoop(mockResearchCtx(), baseConfig)
    expect(result.findings[0]?.output).toContain('No substantive output')
  })
})
