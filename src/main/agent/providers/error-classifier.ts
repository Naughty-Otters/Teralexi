/**
 * LLM API error classifier — inspired by hermes-agent's classify_api_error pattern.
 *
 * Translates raw exceptions from the Vercel AI SDK + provider HTTP layers into a
 * typed ClassifiedError so callers can make consistent retry / give-up decisions
 * without inspecting raw strings or HTTP status codes themselves.
 */

import { APICallError } from 'ai'

// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------

export const enum ErrorCategory {
  /** 429 — quota throttled, back off and retry */
  RATE_LIMIT = 'rate_limit',
  /** 402 / credit exhaustion — will not self-heal, stop retrying */
  BILLING = 'billing',
  /** 401 / 403 — bad or missing credentials */
  AUTH = 'auth',
  /** 404 / unknown model id — configuration error, stop retrying */
  MODEL_NOT_FOUND = 'model_not_found',
  /** Prompt or conversation exceeded context window */
  CONTEXT_OVERFLOW = 'context_overflow',
  /** Safety filter rejection — deterministic for this prompt, stop retrying */
  CONTENT_POLICY = 'content_policy',
  /** 400 / malformed request — developer error, stop retrying */
  INVALID_REQUEST = 'invalid_request',
  /** 500 / 502 / 503 — transient provider outage, retry */
  SERVER_ERROR = 'server_error',
  /** Connection timeout / DNS failure / SSL hiccup — retry */
  TIMEOUT = 'timeout',
  /** User or agent cancelled via AbortSignal — re-throw, do not retry */
  ABORT = 'abort',
  /** Anything else — retry with backoff */
  UNKNOWN = 'unknown',
}

// ---------------------------------------------------------------------------
// Classified result
// ---------------------------------------------------------------------------

export interface ClassifiedError {
  category: ErrorCategory
  /** True when retrying the same request has a reasonable chance of succeeding. */
  isRetryable: boolean
  statusCode?: number
  message: string
  /** Original error, preserved for logging. */
  cause: unknown
}

// ---------------------------------------------------------------------------
// Pattern lists (mirrors hermes-agent's curated lists, scoped to these providers)
// ---------------------------------------------------------------------------

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'ratelimit',
  'too many requests',
  'requests per minute',
  'requests per second',
  'rpm limit',
  'tpm limit',
  'throttled',
  'quota exceeded',
  'overloaded',
  'capacity',
]

const BILLING_PATTERNS = [
  'insufficient credits',
  'credits exhausted',
  'out of credits',
  'billing',
  'payment required',
  'subscription',
  'quota',
  'usage limit exceeded',
  'account balance',
  'prepaid',
  'trial ended',
  'free tier',
]

const CONTEXT_OVERFLOW_PATTERNS = [
  'context length',
  'context_length_exceeded',
  'context window',
  'maximum context',
  'token limit',
  'too many tokens',
  'prompt is too long',
  'input too long',
  'exceeds maximum',
  'maximum tokens',
  'tokens exceeded',
  'content too large',
]

const CONTENT_POLICY_PATTERNS = [
  'content policy',
  'content_policy_violation',
  'safety',
  'harmful',
  'violates our usage',
  'usage policies',
  'inappropriate content',
  'flagged',
  'blocked by',
]

const TIMEOUT_PATTERNS = [
  'timeout',
  'timed out',
  'etimedout',
  'econnreset',
  'econnrefused',
  'socket hang up',
  'network error',
  'fetch failed',
  'failed to fetch',
  'ssl',
  'certificate',
  'aborted',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lowerMessage(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase()
  return String(err).toLowerCase()
}

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p))
}

function classified(
  category: ErrorCategory,
  cause: unknown,
  statusCode?: number,
): ClassifiedError {
  const isRetryable =
    category === ErrorCategory.RATE_LIMIT ||
    category === ErrorCategory.SERVER_ERROR ||
    category === ErrorCategory.TIMEOUT ||
    category === ErrorCategory.UNKNOWN

  return {
    category,
    isRetryable,
    statusCode,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  }
}

// ---------------------------------------------------------------------------
// Status-code primary dispatch
// ---------------------------------------------------------------------------

function classifyByStatus(
  status: number,
  msg: string,
  cause: unknown,
): ClassifiedError {
  switch (status) {
    case 400:
      if (matchesAny(msg, CONTEXT_OVERFLOW_PATTERNS)) {
        return classified(ErrorCategory.CONTEXT_OVERFLOW, cause, status)
      }
      if (matchesAny(msg, RATE_LIMIT_PATTERNS)) {
        // Some providers (Gemini) return rate limits as 400
        return classified(ErrorCategory.RATE_LIMIT, cause, status)
      }
      return classified(ErrorCategory.INVALID_REQUEST, cause, status)

    case 401:
    case 403:
      if (matchesAny(msg, BILLING_PATTERNS)) {
        return classified(ErrorCategory.BILLING, cause, status)
      }
      return classified(ErrorCategory.AUTH, cause, status)

    case 402:
      return classified(ErrorCategory.BILLING, cause, status)

    case 404:
      if (matchesAny(msg, ['model', 'not found', 'no such', 'invalid model'])) {
        return classified(ErrorCategory.MODEL_NOT_FOUND, cause, status)
      }
      return classified(ErrorCategory.INVALID_REQUEST, cause, status)

    case 413:
      return classified(ErrorCategory.CONTEXT_OVERFLOW, cause, status)

    case 429:
      // Disambiguate: "usage limit" + reset indicator → billing-style rate limit
      if (matchesAny(msg, BILLING_PATTERNS) && !matchesAny(msg, ['try again', 'resets', 'retry'])) {
        return classified(ErrorCategory.BILLING, cause, status)
      }
      return classified(ErrorCategory.RATE_LIMIT, cause, status)

    case 500:
    case 502:
    case 503:
    case 529:
      return classified(ErrorCategory.SERVER_ERROR, cause, status)

    default:
      if (status >= 400 && status < 500) {
        return classified(ErrorCategory.INVALID_REQUEST, cause, status)
      }
      if (status >= 500) {
        return classified(ErrorCategory.SERVER_ERROR, cause, status)
      }
      return classified(ErrorCategory.UNKNOWN, cause, status)
  }
}

// ---------------------------------------------------------------------------
// Public classifier
// ---------------------------------------------------------------------------

/**
 * Classify any error thrown during an LLM API call.
 *
 * Priority order (mirrors hermes-agent's pipeline):
 * 1. Abort signal — always re-throw, never retry
 * 2. Vercel AI SDK `APICallError` — use statusCode + responseBody
 * 3. Message pattern matching — for errors without status codes
 * 4. Exception type / name heuristics — for transport errors
 * 5. Fallback: UNKNOWN (retryable)
 */
export function classifyLlmError(error: unknown): ClassifiedError {
  // 1. Abort — never retry, just re-throw
  if (error instanceof Error) {
    const name = error.name
    if (
      name === 'AbortError' ||
      ('code' in error && (error as { code?: unknown }).code === 20) ||
      /abort|cancel/i.test(error.message)
    ) {
      return classified(ErrorCategory.ABORT, error)
    }
  }

  // 2. Vercel AI SDK APICallError — has statusCode + responseBody
  if (APICallError.isInstance(error)) {
    const status = error.statusCode
    const body = (error.responseBody ?? '').toLowerCase()
    const msg = (error.message ?? '').toLowerCase()
    const combined = `${msg} ${body}`

    // Content policy — deterministic per prompt, never retry
    if (matchesAny(combined, CONTENT_POLICY_PATTERNS)) {
      return classified(ErrorCategory.CONTENT_POLICY, error, status)
    }

    if (status != null) {
      return classifyByStatus(status, combined, error)
    }

    // No status code on an APICallError — fall through to message matching
    if (matchesAny(combined, RATE_LIMIT_PATTERNS)) {
      return classified(ErrorCategory.RATE_LIMIT, error)
    }
    if (matchesAny(combined, BILLING_PATTERNS)) {
      return classified(ErrorCategory.BILLING, error)
    }
    if (matchesAny(combined, CONTEXT_OVERFLOW_PATTERNS)) {
      return classified(ErrorCategory.CONTEXT_OVERFLOW, error)
    }

    // SDK sets isRetryable on some errors
    if (!error.isRetryable) {
      return classified(ErrorCategory.INVALID_REQUEST, error)
    }
    return classified(ErrorCategory.UNKNOWN, error)
  }

  // 3. Generic Error — message pattern matching
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()

    if (matchesAny(msg, CONTENT_POLICY_PATTERNS)) {
      return classified(ErrorCategory.CONTENT_POLICY, error)
    }
    if (matchesAny(msg, TIMEOUT_PATTERNS)) {
      return classified(ErrorCategory.TIMEOUT, error)
    }
    if (matchesAny(msg, RATE_LIMIT_PATTERNS)) {
      return classified(ErrorCategory.RATE_LIMIT, error)
    }
    if (matchesAny(msg, BILLING_PATTERNS)) {
      return classified(ErrorCategory.BILLING, error)
    }
    if (matchesAny(msg, CONTEXT_OVERFLOW_PATTERNS)) {
      return classified(ErrorCategory.CONTEXT_OVERFLOW, error)
    }

    // 4. Exception type / name heuristics
    const eName = error.name.toLowerCase()
    if (eName.includes('timeout') || eName.includes('network')) {
      return classified(ErrorCategory.TIMEOUT, error)
    }
    if (eName.includes('auth') || eName.includes('unauthorized')) {
      return classified(ErrorCategory.AUTH, error)
    }
  }

  // 5. Fallback — retryable unknown
  return classified(ErrorCategory.UNKNOWN, error)
}
