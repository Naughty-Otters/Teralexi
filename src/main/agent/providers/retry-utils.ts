/**
 * Retry utilities for LLM API calls.
 *
 * Provides jittered exponential backoff and a withLlmRetry() wrapper that:
 * - Classifies errors via classifyLlmError()
 * - Re-throws AbortErrors and non-retryable errors immediately
 * - Backs off and retries transient failures (rate limits, server errors, timeouts)
 * - Emits user-visible retry notifications via ctx.emitStepProgress()
 */

import { createLogger } from '@main/logger'
import { classifyLlmError, ErrorCategory } from './error-classifier'
import { llmErrorFields, logLlmError, formatLlmErrorProgressChunk } from '../llm/log-llm-error'

const log = createLogger('agent.providers.retry')

/** Minimal surface for retry notifications (step context or background jobs). */
export type LlmRetryContext = {
  emitStepProgress?: (chunk: string) => void
  opts?: { abortSignal?: AbortSignal }
  /** Extra fields merged into retry / error log lines. */
  logMeta?: Record<string, unknown>
}

export function createLlmRetryContext(
  abortSignal?: AbortSignal,
  logMeta?: Record<string, unknown>,
): LlmRetryContext {
  return { opts: { abortSignal }, logMeta }
}

function mergeLogFields(
  ctx: LlmRetryContext,
  label: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return { label, ...ctx.logMeta, ...fields }
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

/**
 * Jittered exponential backoff delay in milliseconds.
 *
 * Formula: min(base * 2^attempt, max) + random jitter up to 50% of the delay.
 * Decorrelates concurrent retries to avoid thundering-herd spikes.
 */
export function jitteredBackoffMs(
  attempt: number,
  baseMs = 1_000,
  maxMs = 30_000,
): number {
  const exponential = Math.min(baseMs * 2 ** attempt, maxMs)
  const jitter = Math.random() * exponential * 0.5
  return Math.floor(exponential + jitter)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

export interface LlmRetryOpts {
  /** Max number of retry attempts after the first failure. Default: 3 */
  maxRetries?: number
  /** Base backoff in ms. Default: 1 000 */
  baseBackoffMs?: number
  /** Max backoff in ms. Default: 30 000 */
  maxBackoffMs?: number
}

/**
 * Execute an LLM call with automatic retry on transient failures.
 *
 * @param ctx - Context for logging and optional user-facing retry notifications.
 * @param label - Short description of the call (e.g. "streamText:silent") for logs.
 * @param fn - Async function that performs the LLM call. Called fresh on every attempt.
 * @param opts - Retry tuning.
 */
export async function withLlmRetry<T>(
  ctx: LlmRetryContext,
  label: string,
  fn: () => Promise<T>,
  opts: LlmRetryOpts = {},
): Promise<T> {
  const { maxRetries = 3, baseBackoffMs = 1_000, maxBackoffMs = 30_000 } = opts
  let lastError: unknown

  log.debug(
    'LLM call starting',
    mergeLogFields(ctx, label, { maxRetries }),
  )

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      ctx.emitStepProgress?.('\n\n[Retrying LLM request — previous streamed output may be incomplete]\n\n')
    }
    try {
      const result = await fn()
      if (attempt > 0) {
        log.info(
          'LLM call succeeded after retry',
          mergeLogFields(ctx, label, { attempt, maxRetries }),
        )
      } else {
        log.debug(
          'LLM call completed',
          mergeLogFields(ctx, label, { attempt }),
        )
      }
      return result
    } catch (err) {
      lastError = err
      const classified = classifyLlmError(err)

      log.warn(
        'LLM error classified',
        mergeLogFields(ctx, label, {
          attempt,
          maxRetries,
          category: classified.category,
          isRetryable: classified.isRetryable,
          statusCode: classified.statusCode,
          classifiedMessage: classified.message,
          ...llmErrorFields(err),
        }),
      )

      // Abort — propagate immediately, never retry
      if (classified.category === ErrorCategory.ABORT) {
        log.info(
          'LLM call aborted',
          mergeLogFields(ctx, label, {
            attempt,
            category: classified.category,
            ...llmErrorFields(err),
          }),
        )
        throw err
      }

      if (!classified.isRetryable || attempt === maxRetries) {
        logLlmError('LLM call failed', err, mergeLogFields(ctx, label, {
          attempt,
          maxRetries,
          category: classified.category,
          isRetryable: classified.isRetryable,
          statusCode: classified.statusCode,
          classifiedMessage: classified.message,
          exhaustedRetries: attempt === maxRetries && classified.isRetryable,
        }))
        ctx.emitStepProgress?.(formatLlmErrorProgressChunk(err, label))
        throw err
      }

      const delayMs = jitteredBackoffMs(attempt, baseBackoffMs, maxBackoffMs)
      const delayS = (delayMs / 1000).toFixed(1)
      const nextAttempt = attempt + 1

      log.warn(
        'LLM call error, scheduling retry',
        mergeLogFields(ctx, label, {
          attempt,
          nextAttempt,
          maxRetries,
          category: classified.category,
          isRetryable: classified.isRetryable,
          statusCode: classified.statusCode,
          classifiedMessage: classified.message,
          delayMs,
          ...llmErrorFields(err),
        }),
      )

      ctx.emitStepProgress?.(
        `\n[Retry ${nextAttempt}/${maxRetries}: ${classified.category} — waiting ${delayS}s]\n`,
      )

      await sleep(delayMs)
    }
  }

  logLlmError('LLM call failed after retry loop', lastError, mergeLogFields(ctx, label, {
    maxRetries,
  }))
  ctx.emitStepProgress?.(formatLlmErrorProgressChunk(lastError, label))
  throw lastError
}
