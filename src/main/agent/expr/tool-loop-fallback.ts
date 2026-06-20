import type { ClassifiedError } from '../providers/error-classifier'
import { ErrorCategory } from '../providers/error-classifier'
import type { TodoItem } from '../types'

export type ToolLoopFailureKind =
  | 'execution_error'
  | 'no_output'
  | 'verify_command_failed'
  | 'verification_failed'
  | 'guardrail_halt'

export type ToolLoopFallbackPlan = TodoItem['fallback_plan']

export type ToolLoopFallbackAction =
  | { type: 'retry_attempt'; reason: string }
  | { type: 'skip_todo'; reason: string }
  | { type: 'manual_intervention'; reason: string }
  | { type: 'pause' }
  | { type: 'abort' }

export type ToolLoopAttemptResult = {
  solved: boolean
  output: string
  failureSummary: string
  failureKind?: ToolLoopFailureKind
  classifiedError?: ClassifiedError
}

const NON_RETRYABLE_CATEGORIES = new Set<ErrorCategory>([
  ErrorCategory.AUTH,
  ErrorCategory.BILLING,
  ErrorCategory.MODEL_NOT_FOUND,
  ErrorCategory.CONTEXT_OVERFLOW,
  ErrorCategory.CONTENT_POLICY,
  ErrorCategory.INVALID_REQUEST,
  ErrorCategory.ABORT,
])

export function isNonRetryableClassifiedError(
  classified?: ClassifiedError,
): boolean {
  if (!classified) return false
  if (classified.category === ErrorCategory.ABORT) return true
  return !classified.isRetryable || NON_RETRYABLE_CATEGORIES.has(classified.category)
}

function planAfterExhaustedRetries(
  fallbackPlan: ToolLoopFallbackPlan,
  reason: string,
): ToolLoopFallbackAction {
  switch (fallbackPlan) {
    case 'manual_intervention':
      return { type: 'manual_intervention', reason }
    case 'skip':
      return { type: 'skip_todo', reason }
    case 'retry':
    default:
      return { type: 'skip_todo', reason }
  }
}

function planOnFirstFailure(
  fallbackPlan: ToolLoopFallbackPlan,
  reason: string,
): ToolLoopFallbackAction {
  switch (fallbackPlan) {
    case 'manual_intervention':
      return { type: 'manual_intervention', reason }
    case 'skip':
      return { type: 'skip_todo', reason }
    case 'retry':
    default:
      return { type: 'skip_todo', reason }
  }
}

export function resolveToolLoopFallback(params: {
  failureKind: ToolLoopFailureKind
  fallbackPlan: ToolLoopFallbackPlan
  attempt: number
  maxAttempts: number
  failureSummary: string
  classifiedError?: ClassifiedError
}): ToolLoopFallbackAction {
  const {
    failureKind,
    fallbackPlan,
    attempt,
    maxAttempts,
    failureSummary,
    classifiedError,
  } = params
  const reason = failureSummary.trim() || failureKind

  if (classifiedError?.category === ErrorCategory.ABORT) {
    return { type: 'abort' }
  }

  const canRetry = attempt < maxAttempts && fallbackPlan === 'retry'

  if (isNonRetryableClassifiedError(classifiedError)) {
    return planOnFirstFailure(fallbackPlan, reason)
  }

  if (failureKind === 'guardrail_halt') {
    if (canRetry) {
      return {
        type: 'retry_attempt',
        reason: `${reason} — change approach instead of repeating the same tool path.`,
      }
    }
    return planAfterExhaustedRetries(fallbackPlan, reason)
  }

  if (failureKind === 'execution_error' && classifiedError?.isRetryable) {
    if (canRetry) {
      return { type: 'retry_attempt', reason }
    }
    return planAfterExhaustedRetries(fallbackPlan, reason)
  }

  if (canRetry) {
    return { type: 'retry_attempt', reason }
  }

  return planOnFirstFailure(
    fallbackPlan === 'retry' ? 'retry' : fallbackPlan,
    reason,
  )
}
