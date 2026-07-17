import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getTeralexiAccountGoogleIdToken,
  getTeralexiServerAccessToken,
  getLastServerAccessTokenFailure,
} = vi.hoisted(() => ({
  getTeralexiAccountGoogleIdToken: vi.fn(),
  getTeralexiServerAccessToken: vi.fn(),
  getLastServerAccessTokenFailure: vi.fn(() => null),
}))

vi.mock('@main/services/teralexi-platform-config', () => ({
  getTeralexiBaseApiUrl: vi.fn(() => 'http://127.0.0.1:8000'),
  getTeralexiGraphqlUrl: vi.fn(() => 'http://127.0.0.1:8000/graphql'),
}))

vi.mock('@main/services/google-account-oauth', () => ({
  getTeralexiAccountGoogleIdToken,
}))

vi.mock('@main/services/teralexi-server-auth', () => ({
  getTeralexiServerAccessToken,
  getLastServerAccessTokenFailure,
}))

vi.mock('./entitlement-session', () => ({
  isEntitlementFeatureAllowed: vi.fn(() => true),
}))

import {
  buildAddProviderMetricInput,
  reportProviderMetric,
} from './provider-metrics-reporter'

describe('provider-metrics-reporter', () => {
  beforeEach(() => {
    getTeralexiAccountGoogleIdToken.mockReset()
    getTeralexiServerAccessToken.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('builds GraphQL input from AI SDK usage fields', () => {
    expect(
      buildAddProviderMetricInput({
        datetime: '2026-06-24T12:00:00.000Z',
        provider: 'openai',
        modelType: 'gpt-4.1',
        sessionId: 'conv-1',
        messageId: 'msg-1',
        agentId: 'agent-1',
        runId: 'run-1',
        parentRunId: 'root-run',
        source: 'toolLoop',
        usage: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          inputTokenDetails: {
            noCacheTokens: 100,
            cacheReadTokens: 20,
            cacheWriteTokens: undefined,
          },
          outputTokenDetails: {
            textTokens: 30,
            reasoningTokens: 15,
          },
          raw: {
            responseTimeMs: 900,
            outputTokensPerSecond: 33.2,
          },
        },
      }),
    ).toEqual({
      datetime: '2026-06-24T12:00:00.000Z',
      provider: 'openai',
      modelType: 'gpt-4.1',
      sessionId: 'conv-1',
      messageId: 'msg-1',
      agentId: 'agent-1',
      runId: 'run-1',
      parentRunId: 'root-run',
      source: 'toolLoop',
      inputTokens: 120,
      inputTokenDetails: {
        noCacheTokens: 100,
        cacheReadTokens: 20,
      },
      outputTokens: 45,
      outputTokenDetails: {
        textTokens: 30,
        reasoningTokens: 15,
      },
      responseTimeMs: 900,
      outputTokensPerSecond: 33.2,
    })
  })

  it('defaults agentId to unknown when missing', () => {
    expect(
      buildAddProviderMetricInput({
        datetime: '2026-06-24T12:00:00.000Z',
        provider: 'openai',
        sessionId: 'conv-1',
        messageId: 'msg-1',
        agentId: null,
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      }),
    ).toEqual(
      expect.objectContaining({
        agentId: 'unknown',
      }),
    )
  })

  it('posts addProviderMetric mutation with server JWT authorization', async () => {
    getTeralexiServerAccessToken.mockResolvedValue('server-access-token')

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          addProviderMetric: {
            id: 7,
            userId: 'user-from-server',
            datetime: '2026-06-24T12:00:00.000Z',
            provider: 'openai',
            modelType: 'gpt-4.1',
            sessionId: 'conv-1',
            messageId: 'msg-1',
            runId: 'run-1',
            agentId: 'agent-1',
            parentRunId: null,
            source: 'toolLoop',
            inputTokens: 120,
            inputTokenDetails: {
              cacheReadTokens: 20,
              cacheWriteTokens: null,
              noCacheTokens: 100,
            },
            outputTokens: 45,
            outputTokenDetails: {
              reasoningTokens: 15,
              textTokens: 30,
            },
            responseTimeMs: 900,
            outputTokensPerSecond: 33.2,
          },
        },
      }),
    } as Response)

    const metric = await reportProviderMetric({
      datetime: '2026-06-24T12:00:00.000Z',
      provider: 'openai',
      modelType: 'gpt-4.1',
      sessionId: 'conv-1',
      messageId: 'msg-1',
      agentId: 'agent-1',
      inputTokens: 120,
    })

    expect(metric.userId).toBe('user-from-server')
    expect(getTeralexiServerAccessToken).toHaveBeenCalledWith('http://127.0.0.1:8000')
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-access-token',
        }),
      }),
    )
  })

  it('rejects when server access token is unavailable', async () => {
    getTeralexiServerAccessToken.mockResolvedValue(null)

    await expect(
      reportProviderMetric({
        datetime: '2026-06-24T12:00:00.000Z',
        provider: 'openai',
        sessionId: 'conv-1',
        messageId: 'msg-1',
        agentId: 'agent-1',
        inputTokens: 1,
      }),
    ).rejects.toThrow('Teralexi server access token is not available')
  })
})
