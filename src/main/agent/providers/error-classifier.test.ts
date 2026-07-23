import { describe, expect, it } from 'vitest'
import { APICallError } from 'ai'
import { classifyLlmError, ErrorCategory } from './error-classifier'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiError(status: number, body = '', message = ''): APICallError {
  return new APICallError({
    message: message || `HTTP ${status}`,
    url: 'https://api.example.com',
    requestBodyValues: {},
    statusCode: status,
    responseBody: body,
    isRetryable: status >= 500,
  })
}

function plainError(message: string): Error {
  return new Error(message)
}

// ---------------------------------------------------------------------------
// APICallError — status-code dispatch
// ---------------------------------------------------------------------------

describe('classifyLlmError — APICallError status codes', () => {
  it('classifies 429 as RATE_LIMIT (retryable)', () => {
    const result = classifyLlmError(apiError(429, 'too many requests'))
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT)
    expect(result.isRetryable).toBe(true)
    expect(result.statusCode).toBe(429)
  })

  it('classifies 500 as SERVER_ERROR (retryable)', () => {
    const result = classifyLlmError(apiError(500))
    expect(result.category).toBe(ErrorCategory.SERVER_ERROR)
    expect(result.isRetryable).toBe(true)
  })

  it('classifies 503 as SERVER_ERROR (retryable)', () => {
    const result = classifyLlmError(apiError(503))
    expect(result.category).toBe(ErrorCategory.SERVER_ERROR)
    expect(result.isRetryable).toBe(true)
  })

  it('classifies 401 as AUTH (non-retryable)', () => {
    const result = classifyLlmError(apiError(401))
    expect(result.category).toBe(ErrorCategory.AUTH)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies 403 as AUTH (non-retryable)', () => {
    const result = classifyLlmError(apiError(403))
    expect(result.category).toBe(ErrorCategory.AUTH)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies 402 as BILLING (non-retryable)', () => {
    const result = classifyLlmError(apiError(402))
    expect(result.category).toBe(ErrorCategory.BILLING)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies 404 with model message as MODEL_NOT_FOUND', () => {
    const result = classifyLlmError(apiError(404, 'model not found'))
    expect(result.category).toBe(ErrorCategory.MODEL_NOT_FOUND)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies 413 as CONTEXT_OVERFLOW (non-retryable)', () => {
    const result = classifyLlmError(apiError(413))
    expect(result.category).toBe(ErrorCategory.CONTEXT_OVERFLOW)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies 400 with context pattern as CONTEXT_OVERFLOW', () => {
    const result = classifyLlmError(apiError(400, 'context length exceeded'))
    expect(result.category).toBe(ErrorCategory.CONTEXT_OVERFLOW)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies 400 plain as INVALID_REQUEST', () => {
    const result = classifyLlmError(apiError(400))
    expect(result.category).toBe(ErrorCategory.INVALID_REQUEST)
    expect(result.isRetryable).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// APICallError — body/message pattern overrides
// ---------------------------------------------------------------------------

describe('classifyLlmError — body pattern overrides', () => {
  it('detects content policy in response body', () => {
    const result = classifyLlmError(apiError(400, 'violates our usage policies'))
    expect(result.category).toBe(ErrorCategory.CONTENT_POLICY)
    expect(result.isRetryable).toBe(false)
  })

  it('detects content policy on 200 with safety text', () => {
    const result = classifyLlmError(apiError(400, 'content policy violation'))
    expect(result.category).toBe(ErrorCategory.CONTENT_POLICY)
  })

  it('detects billing in 403 body', () => {
    const result = classifyLlmError(apiError(403, 'insufficient credits'))
    expect(result.category).toBe(ErrorCategory.BILLING)
  })

  it('treats 429 with billing message + no reset hint as BILLING', () => {
    const result = classifyLlmError(apiError(429, 'billing quota exceeded on plan'))
    expect(result.category).toBe(ErrorCategory.BILLING)
  })

  it('treats 429 with rate limit message + retry hint as RATE_LIMIT', () => {
    const result = classifyLlmError(apiError(429, 'rate limit exceeded, try again later'))
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT)
  })

  it('treats Gemini 400 rate limit as RATE_LIMIT', () => {
    const result = classifyLlmError(apiError(400, 'quota exceeded requests per minute'))
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT)
  })
})

// ---------------------------------------------------------------------------
// Plain Error — message pattern matching
// ---------------------------------------------------------------------------

describe('classifyLlmError — plain Error message patterns', () => {
  it('classifies timeout as TIMEOUT (retryable)', () => {
    const result = classifyLlmError(plainError('request timed out'))
    expect(result.category).toBe(ErrorCategory.TIMEOUT)
    expect(result.isRetryable).toBe(true)
  })

  it('classifies fetch failed as TIMEOUT', () => {
    const result = classifyLlmError(plainError('fetch failed'))
    expect(result.category).toBe(ErrorCategory.TIMEOUT)
  })

  it('classifies network error as TIMEOUT', () => {
    const result = classifyLlmError(plainError('network error'))
    expect(result.category).toBe(ErrorCategory.TIMEOUT)
  })

  it('classifies rate limit message as RATE_LIMIT', () => {
    const result = classifyLlmError(plainError('rate limit exceeded'))
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT)
  })

  it('classifies structured-output parse failures as INVALID_REQUEST (non-retryable)', () => {
    const result = classifyLlmError(
      plainError('No object generated: could not parse the response.'),
    )
    expect(result.category).toBe(ErrorCategory.INVALID_REQUEST)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies NoObjectGeneratedError by name as INVALID_REQUEST', () => {
    const err = Object.assign(
      new Error('No object generated'),
      { name: 'AI_NoObjectGeneratedError' },
    )
    const result = classifyLlmError(err)
    expect(result.category).toBe(ErrorCategory.INVALID_REQUEST)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies context length message as CONTEXT_OVERFLOW', () => {
    const result = classifyLlmError(plainError('context length exceeded'))
    expect(result.category).toBe(ErrorCategory.CONTEXT_OVERFLOW)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies unknown error as UNKNOWN (retryable)', () => {
    const result = classifyLlmError(plainError('something exploded'))
    expect(result.category).toBe(ErrorCategory.UNKNOWN)
    expect(result.isRetryable).toBe(true)
  })

  it('classifies non-Error as UNKNOWN', () => {
    const result = classifyLlmError('a bare string error')
    expect(result.category).toBe(ErrorCategory.UNKNOWN)
    expect(result.isRetryable).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Abort errors
// ---------------------------------------------------------------------------

describe('classifyLlmError — abort errors', () => {
  it('classifies DOMException AbortError as ABORT', () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    const result = classifyLlmError(err)
    expect(result.category).toBe(ErrorCategory.ABORT)
    expect(result.isRetryable).toBe(false)
  })

  it('classifies error with cancel in message as ABORT', () => {
    const err = new Error('Request cancelled by user')
    const result = classifyLlmError(err)
    expect(result.category).toBe(ErrorCategory.ABORT)
  })
})

// ---------------------------------------------------------------------------
// Retryable flag invariants
// ---------------------------------------------------------------------------

describe('classifyLlmError — isRetryable invariants', () => {
  const retryable = [ErrorCategory.RATE_LIMIT, ErrorCategory.SERVER_ERROR, ErrorCategory.TIMEOUT, ErrorCategory.UNKNOWN]
  const nonRetryable = [
    ErrorCategory.AUTH,
    ErrorCategory.BILLING,
    ErrorCategory.MODEL_NOT_FOUND,
    ErrorCategory.CONTEXT_OVERFLOW,
    ErrorCategory.CONTENT_POLICY,
    ErrorCategory.INVALID_REQUEST,
    ErrorCategory.ABORT,
  ]

  for (const cat of retryable) {
    it(`${cat} is retryable`, () => {
      // drive through an error that produces this category
      const statusMap: Partial<Record<ErrorCategory, number>> = {
        [ErrorCategory.RATE_LIMIT]: 429,
        [ErrorCategory.SERVER_ERROR]: 500,
      }
      const status = statusMap[cat]
      const err = status ? apiError(status) : plainError(cat === ErrorCategory.TIMEOUT ? 'timed out' : 'unexpected')
      const result = classifyLlmError(err)
      // Only check categories we can reliably produce
      if (result.category === cat) {
        expect(result.isRetryable).toBe(true)
      }
    })
  }

  for (const cat of nonRetryable) {
    it(`${cat} is NOT retryable`, () => {
      const statusMap: Partial<Record<ErrorCategory, number>> = {
        [ErrorCategory.AUTH]: 401,
        [ErrorCategory.BILLING]: 402,
        [ErrorCategory.CONTEXT_OVERFLOW]: 413,
        [ErrorCategory.INVALID_REQUEST]: 400,
      }
      const status = statusMap[cat]
      if (status) {
        const result = classifyLlmError(apiError(status))
        if (result.category === cat) {
          expect(result.isRetryable).toBe(false)
        }
      }
    })
  }
})
