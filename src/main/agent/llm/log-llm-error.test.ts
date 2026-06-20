import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import {
  formatLlmErrorForUi,
  formatLlmErrorProgressChunk,
  llmErrorFields,
} from './log-llm-error'
import { ErrorCategory } from '../providers/error-classifier'

describe('llmErrorFields', () => {
  it('includes API metadata for APICallError', () => {
    const err = new APICallError({
      message: 'Not Found',
      url: 'https://api.moonshot.ai/v1/responses',
      requestBodyValues: {},
      statusCode: 404,
      responseHeaders: {},
      responseBody: '{"error":"model not found"}',
      isRetryable: false,
    })

    expect(llmErrorFields(err)).toMatchObject({
      errorName: 'AI_APICallError',
      errorMessage: 'Not Found',
      statusCode: 404,
      url: 'https://api.moonshot.ai/v1/responses',
      isRetryable: false,
      responseBody: '{"error":"model not found"}',
    })
  })

  it('truncates very large response bodies', () => {
    const err = new APICallError({
      message: 'Bad Request',
      url: 'https://api.example.com/v1/chat',
      requestBodyValues: {},
      statusCode: 400,
      responseHeaders: {},
      responseBody: 'x'.repeat(5_000),
      isRetryable: false,
    })

    const fields = llmErrorFields(err)
    expect(String(fields.responseBody)).toContain('…[truncated]')
    expect(String(fields.responseBody).length).toBeLessThan(5_000)
  })
})

describe('formatLlmErrorForUi', () => {
  it('includes category and status for APICallError', () => {
    const err = new APICallError({
      message: 'Not Found',
      url: 'https://api.example.com',
      requestBodyValues: {},
      statusCode: 404,
      responseHeaders: {},
      responseBody: '',
      isRetryable: false,
    })
    const text = formatLlmErrorForUi(err)
    expect(text).toContain(ErrorCategory.MODEL_NOT_FOUND)
    expect(text).toContain('HTTP 404')
    expect(text).toContain('Not Found')
  })

  it('formats plain Error messages', () => {
    const text = formatLlmErrorForUi(new Error('context length exceeded'))
    expect(text).toContain(ErrorCategory.CONTEXT_OVERFLOW)
    expect(text).toContain('context length exceeded')
  })
})

describe('formatLlmErrorProgressChunk', () => {
  it('includes label and formatted error', () => {
    const chunk = formatLlmErrorProgressChunk(
      new Error('rate limit exceeded'),
      'streamText:progress',
    )
    expect(chunk).toContain('streamText:progress')
    expect(chunk).toContain('⚠ **LLM error**')
    expect(chunk).toContain(ErrorCategory.RATE_LIMIT)
  })
})
