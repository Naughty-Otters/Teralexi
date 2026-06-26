import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSystemPropValue, getOpenFdeAccountGoogleIdToken, getOpenFdeServerAccessToken } =
  vi.hoisted(() => ({
    getSystemPropValue: vi.fn(),
    getOpenFdeAccountGoogleIdToken: vi.fn(),
    getOpenFdeServerAccessToken: vi.fn(),
  }))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue,
}))

vi.mock('@main/services/google-account-oauth', () => ({
  getOpenFdeAccountGoogleIdToken,
}))

vi.mock('@main/services/openfde-server-auth', () => ({
  getOpenFdeServerAccessToken,
  resolveMetricsApiBaseUrl: (graphqlUrl: string) => new URL(graphqlUrl).origin,
}))

import {
  buildAddProviderMetricInput,
  reportProviderMetric,
} from './provider-metrics-reporter'

describe('provider-metrics-reporter', () => {
  beforeEach(() => {
    getSystemPropValue.mockReset()
    getOpenFdeAccountGoogleIdToken.mockReset()
    getOpenFdeServerAccessToken.mockReset()
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

  it('posts addProviderMetric mutation with server JWT authorization', async () => {
    getSystemPropValue.mockReturnValue('http://127.0.0.1:8000/graphql')
    getOpenFdeServerAccessToken.mockResolvedValue('server-access-token')

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
      inputTokens: 120,
    })

    expect(metric.userId).toBe('user-from-server')
    expect(getOpenFdeServerAccessToken).toHaveBeenCalledWith('http://127.0.0.1:8000')
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
    getSystemPropValue.mockReturnValue('http://127.0.0.1:8000/graphql')
    getOpenFdeServerAccessToken.mockResolvedValue(null)

    await expect(
      reportProviderMetric({
        datetime: '2026-06-24T12:00:00.000Z',
        provider: 'openai',
        sessionId: 'conv-1',
        messageId: 'msg-1',
        inputTokens: 1,
      }),
    ).rejects.toThrow('OpenFDE server access token is not available')
  })
})
