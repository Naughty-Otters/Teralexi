import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AgentFlowContext } from '../context'
import { RESEARCH_STEP_ID, RESEARCH_STEP_TITLE } from '../constants/step-ids'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import {
  ResearchOrchestrator,
  researchFlowStepDefinition,
} from './research-step'
import { ResearchStepContext } from './research/research-step-context'
import type { ResearchStepData } from './step-io'

vi.mock('../expr/expression-runner', () => ({
  withStepToolScope: vi.fn(
    (_flow: unknown, _tools: unknown, fn: () => Promise<void>) => fn(),
  ),
}))

vi.mock('./research/loop', () => ({
  runResearchLoop: vi.fn(),
}))

vi.mock('./pending-state', () => ({
  savePendingApprovalState: vi.fn(),
}))

vi.mock('./research/handoff', () => ({
  maybeScheduleResearchHandoff: vi.fn(),
}))

import { runResearchLoop } from './research/loop'
import { savePendingApprovalState } from './pending-state'
import { maybeScheduleResearchHandoff } from './research/handoff'

function makeFlow(
  availableSet: string[] = ['web_search', 'web_scrape'],
  messages: AgentFlowContext['currentMessages'] = [
    { role: 'user', content: 'quantum computing' },
  ],
) {
  return new AgentFlowContext(
    {
      provider: 'ollama',
      model: 'test',
      systemPrompt: '',
      messages,
      userId: 'u1',
      availableSet,
    },
    {},
  )
}

function makeResearchCtx(
  flow: AgentFlowContext,
  flowStepConfig?: Record<string, unknown>,
): ResearchStepContext {
  return new ResearchStepContext(
    flow,
    RESEARCH_STEP_ID,
    RESEARCH_STEP_TITLE,
    'research:test',
    flowStepConfig,
  )
}

describe('ResearchOrchestrator', () => {
  beforeEach(() => {
    vi.mocked(runResearchLoop).mockReset()
    vi.mocked(savePendingApprovalState).mockReset()
    vi.mocked(maybeScheduleResearchHandoff).mockReset()
  })

  it('shouldRun is false without topic or required tools', () => {
    const noTopicCtx = makeResearchCtx(makeFlow(['web_search'], []), {
      research: {},
    })
    expect(new ResearchOrchestrator(noTopicCtx).shouldRun()).toBe(false)

    const noToolsCtx = makeResearchCtx(makeFlow(['write_file']), {
      research: { topic: 'quantum' },
    })
    expect(new ResearchOrchestrator(noToolsCtx).shouldRun()).toBe(false)
  })

  it('shouldRun is true when topic and tools are available', () => {
    const ctx = makeResearchCtx(makeFlow(), { research: { topic: 'quantum' } })
    expect(new ResearchOrchestrator(ctx).shouldRun()).toBe(true)
  })

  it('execute throws when topic is missing', async () => {
    const ctx = makeResearchCtx(makeFlow(['web_search'], []), { research: {} })
    await expect(new ResearchOrchestrator(ctx).execute()).rejects.toThrow(
      /requires a topic/,
    )
  })

  it('execute throws when required tools are unavailable', async () => {
    const ctx = makeResearchCtx(makeFlow(['write_file']), {
      research: { topic: 'quantum' },
    })
    await expect(new ResearchOrchestrator(ctx).execute()).rejects.toThrow(
      /requires at least one of/,
    )
  })

  it('records research output when loop completes', async () => {
    vi.mocked(runResearchLoop).mockResolvedValue({
      topic: 'quantum',
      findings: [{ question: 'q', output: 'a', round: 1 }],
      digestMarkdown: '# Research: quantum',
      paused: false,
    })

    const ctx = makeResearchCtx(makeFlow(), { research: { topic: 'quantum' } })
    ctx.recordStepOutput = vi.fn()

    await new ResearchOrchestrator(ctx).execute()

    expect(ctx.recordStepOutput).toHaveBeenCalledWith(
      RESEARCH_STEP_ID,
      RESEARCH_STEP_TITLE,
      expect.objectContaining({
        topic: 'quantum',
        digestMarkdown: '# Research: quantum',
      }),
      '# Research: quantum',
    )
    expect(maybeScheduleResearchHandoff).toHaveBeenCalled()
    expect(savePendingApprovalState).not.toHaveBeenCalled()
  })

  it('persists pending approval when loop pauses', async () => {
    vi.mocked(runResearchLoop).mockResolvedValue({
      topic: 'quantum',
      findings: [],
      digestMarkdown: '# Research: quantum',
      paused: true,
    })

    const ctx = makeResearchCtx(makeFlow(), { research: { topic: 'quantum' } })
    ctx.recordStepOutput = vi.fn()

    await new ResearchOrchestrator(ctx).execute()

    expect(savePendingApprovalState).toHaveBeenCalledWith(ctx)
    expect(ctx.recordStepOutput).not.toHaveBeenCalled()
  })
})

describe('researchFlowStepDefinition', () => {
  const sampleEntry = {
    stepId: RESEARCH_STEP_ID,
    instanceKey: 'research:1',
    timestamp: new Date().toISOString(),
    data: {
      topic: 'quantum',
      findings: [],
      digestMarkdown: '# Research digest',
      rendered: '# Research digest',
      text: '# Research digest',
    } satisfies ResearchStepData,
  }

  it('shouldRun mirrors orchestrator gating', () => {
    const flow = makeFlow()
    expect(
      researchFlowStepDefinition.shouldRun?.({
        flow,
        config: { research: { topic: 'quantum' } },
      } as never),
    ).toBe(true)
    expect(
      researchFlowStepDefinition.shouldRun?.({
        flow: makeFlow(['write_file']),
        config: { research: { topic: 'quantum' } },
      } as never),
    ).toBe(false)
  })

  it('maps outputs to context messages, sub-steps, and captures', () => {
    expect(researchFlowStepDefinition.hasOutput?.([sampleEntry])).toBe(true)
    expect(researchFlowStepDefinition.toContextMessages?.([sampleEntry])).toEqual([
      {
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.RESEARCH_OUTPUT}\n\n# Research digest`,
      },
    ])
    expect(researchFlowStepDefinition.toSubStep?.([sampleEntry])).toEqual({
      type: 'ResearchStep',
      title: RESEARCH_STEP_TITLE,
      content: '# Research digest',
    })
    expect(researchFlowStepDefinition.toStepCapture?.([sampleEntry])).toEqual({
      stepType: 'ResearchStep',
      title: RESEARCH_STEP_TITLE,
      content: '# Research digest',
    })
  })

  it('returns empty render helpers when digest is missing', () => {
    const emptyEntry = {
      ...sampleEntry,
      data: { topic: 'x', findings: [] } satisfies ResearchStepData,
    }
    expect(researchFlowStepDefinition.hasOutput?.([emptyEntry])).toBe(false)
    expect(researchFlowStepDefinition.toContextMessages?.([emptyEntry])).toEqual([])
    expect(researchFlowStepDefinition.toSubStep?.([emptyEntry])).toBeNull()
    expect(researchFlowStepDefinition.toStepCapture?.([emptyEntry])).toBeNull()
  })

  it('run executes orchestrator when gating passes', async () => {
    vi.mocked(runResearchLoop).mockResolvedValue({
      topic: 'quantum',
      findings: [],
      digestMarkdown: '# Research: quantum',
      paused: false,
    })

    const flow = makeFlow()
    const createStepContext = vi.fn((_stepId, _title, config) =>
      makeResearchCtx(flow, config as Record<string, unknown>),
    )

    await researchFlowStepDefinition.run({
      flow: Object.assign(flow, { createStepContext }),
      config: { research: { topic: 'quantum' }, title: 'Deep dive' },
    } as never)

    expect(createStepContext).toHaveBeenCalledWith(
      RESEARCH_STEP_ID,
      'Deep dive',
      expect.objectContaining({ research: { topic: 'quantum' } }),
    )
    expect(runResearchLoop).toHaveBeenCalled()
  })

  it('run skips execute when shouldRun is false', async () => {
    const flow = makeFlow(['write_file'])
    await researchFlowStepDefinition.run({
      flow,
      config: { research: { topic: 'quantum' } },
    } as never)
    expect(runResearchLoop).not.toHaveBeenCalled()
  })
})
