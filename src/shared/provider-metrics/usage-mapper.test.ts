import { describe, expect, it } from 'vitest'
import {
  hasProviderMetricUsageData,
  mapProviderMetricFieldsFromUsage,
} from './usage-mapper'

describe('provider metric usage mapper', () => {
  it('maps token counts and details from LanguageModelUsage', () => {
    expect(
      mapProviderMetricFieldsFromUsage({
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
        inputTokenDetails: {
          noCacheTokens: 100,
          cacheReadTokens: 20,
          cacheWriteTokens: 0,
        },
        outputTokenDetails: {
          textTokens: 30,
          reasoningTokens: 15,
        },
      }),
    ).toEqual({
      inputTokens: 120,
      inputTokenDetails: {
        noCacheTokens: 100,
        cacheReadTokens: 20,
        cacheWriteTokens: 0,
      },
      outputTokens: 45,
      outputTokenDetails: {
        textTokens: 30,
        reasoningTokens: 15,
      },
    })
  })

  it('extracts timing and tool execution fields from raw usage', () => {
    expect(
      mapProviderMetricFieldsFromUsage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        raw: {
          stepTimeMs: 900,
          responseTimeMs: 1200,
          timeToFirstOutputMs: 250,
          outputTokensPerSecond: 42.5,
          toolExecutionMs: { grep_files: 120, read_file: 80 },
        },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      stepTimeMs: 900,
      responseTimeMs: 1200,
      timeToFirstOutputMs: 250,
      outputTokensPerSecond: 42.5,
      toolExecutionMs: { grep_files: 120, read_file: 80 },
    })
  })

  it('detects when usage has reportable data', () => {
    expect(hasProviderMetricUsageData(null)).toBe(false)
    expect(
      hasProviderMetricUsageData({
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
      }),
    ).toBe(false)
    expect(
      hasProviderMetricUsageData({
        inputTokens: 1,
        outputTokens: 0,
        totalTokens: 1,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
      }),
    ).toBe(true)
  })
})
