import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSystemPropValue, getClientId } = vi.hoisted(() => ({
  getSystemPropValue: vi.fn(),
  getClientId: vi.fn(),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue,
}))

vi.mock('./client-identity', () => ({
  getClientId,
}))

import {
  buildAddProviderMetricInput,
  reportProviderMetric,
} from './provider-metrics-reporter'

describe('provider-metrics-reporter', () => {
  beforeEach(() => {
    getSystemPropValue.mockReset()
    getClientId.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('builds GraphQL input from AI SDK usage fields', () => {
    getClientId.mockReturnValue('client-1')

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
      userId: 'client-1',
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

  it('skips invalid payloads', () => {
    getClientId.mockReturnValue('')

    expect(
      buildAddProviderMetricInput({
        datetime: '2026-06-24T12:00:00.000Z',
        provider: 'openai',
        sessionId: 'conv-1',
        messageId: 'msg-1',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputTokenDetails: {
            noCacheTokens: undefined,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          outputTokenDetails: {
            textTokens: undefined,
            reasoningTokens: undefined,
          },
        },
      }),
    ).toBeNull()
  })

  it('posts addProviderMetric mutation to configured GraphQL endpoint', async () => {
    getSystemPropValue.mockReturnValue('http://127.0.0.1:8000/graphql')
    getClientId.mockReturnValue('client-1')

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          addProviderMetric: {
            id: 7,
            userId: 'client-1',
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
      userId: 'client-1',
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

    expect(metric.id).toBe(7)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
    expect(body.query).toContain('modelType')
    expect(body.query).toContain('inputTokenDetails')
    expect(body.query).toContain('responseTimeMs')
    expect(body.variables.input).toEqual({
      userId: 'client-1',
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
})
