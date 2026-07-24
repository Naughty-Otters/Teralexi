import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  readStreamTextUsage,
  readAgentTotalUsage,
  recordLlmTokenUsage,
  recordLlmTokenUsageFromOpts,
  usageToCounts,
} from './usage'
import { getCurrentAgentRunScope } from '../run/run-scope'

const { insertTokenUsage, reportProviderMetricAsync } = vi.hoisted(() => ({
  insertTokenUsage: vi.fn(),
  reportProviderMetricAsync: vi.fn(),
}))

vi.mock('../run/run-scope', () => ({
  getCurrentAgentRunScope: vi.fn(() => undefined),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({ insertTokenUsage }),
}))

vi.mock('@main/services/provider-metrics-reporter', () => ({
  reportProviderMetricAsync,
}))

describe('usageToCounts', () => {
  it('returns zeros for missing usage', () => {
    expect(usageToCounts(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    })
  })

  it('sums tokens and derives total when omitted', () => {
    expect(usageToCounts({ inputTokens: 10, outputTokens: 5 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })
  })
})

describe('recordLlmTokenUsage', () => {
  beforeEach(() => {
    insertTokenUsage.mockClear()
    reportProviderMetricAsync.mockClear()
    vi.mocked(getCurrentAgentRunScope).mockReturnValue(undefined)
  })

  it('skips insert when all counts zero', () => {
    recordLlmTokenUsage({
      userId: 'u1',
      source: 'test',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
    expect(insertTokenUsage).not.toHaveBeenCalled()
  })

  it('persists non-zero usage', () => {
    recordLlmTokenUsage({
      userId: 'u1',
      conversationId: 'conv-1',
      assistantMessageId: 'msg-1',
      agentId: 'agent-1',
      source: 'streamText',
      provider: 'openai',
      model: 'gpt',
      usage: { inputTokens: 3, outputTokens: 7, totalTokens: 10 },
    })
    expect(insertTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        inputTokens: 3,
        outputTokens: 7,
        totalTokens: 10,
      }),
    )
    expect(reportProviderMetricAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        modelType: 'gpt',
        sessionId: 'conv-1',
        messageId: 'msg-1',
        agentId: 'agent-1',
        source: 'streamText',
        usage: { inputTokens: 3, outputTokens: 7, totalTokens: 10 },
      }),
    )
  })

  it('forwards run scope fields to provider metrics publish', () => {
    vi.mocked(getCurrentAgentRunScope).mockReturnValue({
      runId: 'child-run',
      parentRunId: 'root-run',
      depth: 1,
    })

    recordLlmTokenUsage({
      userId: 'u1',
      conversationId: 'conv-1',
      assistantMessageId: 'msg-1',
      agentId: 'sub-agent',
      source: 'toolLoop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })

    expect(reportProviderMetricAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'child-run',
        parentRunId: 'root-run',
        agentId: 'sub-agent',
        source: 'toolLoop',
      }),
    )
  })
})

describe('readStreamTextUsage', () => {
  it('prefers totalUsage when present', async () => {
    const usage = { inputTokens: 5, outputTokens: 3, totalTokens: 8 }
    const out = await readStreamTextUsage({
      totalUsage: Promise.resolve(usage),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    })
    expect(out).toEqual(usage)
  })

  it('sums step usages when primary usage empty', async () => {
    const out = await readStreamTextUsage({
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      steps: Promise.resolve([
        { usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } },
        { usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
      ]),
    })
    expect(out.totalTokens).toBe(8)
  })

  it('merges finalStep.performance into usage for metrics', async () => {
    const out = await readStreamTextUsage({
      totalUsage: Promise.resolve({
        inputTokens: 5,
        outputTokens: 3,
        totalTokens: 8,
      }),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      finalStep: Promise.resolve({
        performance: {
          stepTimeMs: 1200,
          responseTimeMs: 900,
          timeToFirstOutputMs: 150,
          outputTokensPerSecond: 12.5,
          toolExecutionMs: { 'call-1': 400 },
        },
      }),
    })
    expect(out).toEqual(
      expect.objectContaining({
        inputTokens: 5,
        outputTokens: 3,
        totalTokens: 8,
        stepTimeMs: 1200,
        responseTimeMs: 900,
        timeToFirstOutputMs: 150,
        outputTokensPerSecond: 12.5,
        toolExecutionMs: { 'call-1': 400 },
      }),
    )
  })
})

describe('readAgentTotalUsage', () => {
  it('returns totalUsage or usage promise', async () => {
    const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    await expect(
      readAgentTotalUsage({ totalUsage: Promise.resolve(usage) }),
    ).resolves.toEqual(usage)
    await expect(
      readAgentTotalUsage({ usage: Promise.resolve(usage) }),
    ).resolves.toEqual(usage)
    await expect(readAgentTotalUsage({})).resolves.toBeUndefined()
  })

  it('merges performance from finalStep', async () => {
    const out = await readAgentTotalUsage({
      usage: Promise.resolve({
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
      }),
      finalStep: Promise.resolve({
        performance: { timeToFirstOutputMs: 80, responseTimeMs: 500 },
      }),
    })
    expect(out).toEqual(
      expect.objectContaining({
        totalTokens: 3,
        timeToFirstOutputMs: 80,
        responseTimeMs: 500,
      }),
    )
  })
})

describe('recordLlmTokenUsageFromOpts', () => {
  beforeEach(() => insertTokenUsage.mockClear())

  it('forwards opts fields', () => {
    recordLlmTokenUsageFromOpts(
      {
        userId: 'u1',
        conversationId: 'c1',
        provider: 'openai',
        model: 'gpt',
      } as never,
      { source: 'planning', stepId: 'planning' },
      { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    )
    expect(insertTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'c1',
        provider: 'openai',
        stepId: 'planning',
      }),
    )
  })
})
