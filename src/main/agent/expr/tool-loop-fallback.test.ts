import { describe, expect, it } from 'vitest'
import {
  ErrorCategory,
  type ClassifiedError,
} from '../providers/error-classifier'
import { resolveToolLoopFallback } from './tool-loop-fallback'

function classified(
  category: ErrorCategory,
  isRetryable: boolean,
): ClassifiedError {
  return { category, isRetryable, message: category }
}

describe('resolveToolLoopFallback', () => {
  it('retries verification failure while attempts remain and plan is retry', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'verification_failed',
      fallbackPlan: 'retry',
      attempt: 1,
      maxAttempts: 3,
      failureSummary: 'criteria not met',
    })
    expect(action).toEqual({
      type: 'retry_attempt',
      reason: 'criteria not met',
    })
  })

  it('skips todo after exhausted retries when plan is retry', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'verification_failed',
      fallbackPlan: 'retry',
      attempt: 3,
      maxAttempts: 3,
      failureSummary: 'still failing',
    })
    expect(action).toEqual({ type: 'skip_todo', reason: 'still failing' })
  })

  it('skips todo on first failure when plan is skip', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'no_output',
      fallbackPlan: 'skip',
      attempt: 1,
      maxAttempts: 1,
      failureSummary: 'No output',
    })
    expect(action).toEqual({ type: 'skip_todo', reason: 'No output' })
  })

  it('requests manual intervention when plan is manual_intervention', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'verify_command_failed',
      fallbackPlan: 'manual_intervention',
      attempt: 1,
      maxAttempts: 1,
      failureSummary: 'command failed',
    })
    expect(action).toEqual({
      type: 'manual_intervention',
      reason: 'command failed',
    })
  })

  it('does not retry non-retryable auth errors even when plan is retry', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'execution_error',
      fallbackPlan: 'retry',
      attempt: 1,
      maxAttempts: 3,
      failureSummary: '401 unauthorized',
      classifiedError: classified(ErrorCategory.AUTH, false),
    })
    expect(action).toEqual({ type: 'skip_todo', reason: '401 unauthorized' })
  })

  it('retries retryable server errors while attempts remain', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'execution_error',
      fallbackPlan: 'retry',
      attempt: 2,
      maxAttempts: 3,
      failureSummary: '503',
      classifiedError: classified(ErrorCategory.SERVER_ERROR, true),
    })
    expect(action).toEqual({ type: 'retry_attempt', reason: '503' })
  })

  it('retries guardrail halt with change-approach hint', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'guardrail_halt',
      fallbackPlan: 'retry',
      attempt: 1,
      maxAttempts: 3,
      failureSummary: 'same tool loop',
    })
    expect(action.type).toBe('retry_attempt')
    expect(action).toMatchObject({
      reason: expect.stringContaining('change approach'),
    })
  })

  it('aborts on classified abort errors', () => {
    const action = resolveToolLoopFallback({
      failureKind: 'execution_error',
      fallbackPlan: 'retry',
      attempt: 1,
      maxAttempts: 3,
      failureSummary: 'cancelled',
      classifiedError: classified(ErrorCategory.ABORT, false),
    })
    expect(action).toEqual({ type: 'abort' })
  })
})
