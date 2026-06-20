import { APICallError } from 'ai'
import { createLogger } from '@main/logger'
import { classifyLlmError } from '../providers/error-classifier'
import {
  LLM_ERROR_PROGRESS_MARKER,
} from '@shared/agent/llm-error-ui'

const log = createLogger('agent.llm')

const MAX_RESPONSE_BODY_LOG_CHARS = 2_000

function truncateForLog(value: string, max = MAX_RESPONSE_BODY_LOG_CHARS): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…[truncated]`
}

/** Structured error fields for log lines (message + short stack + API metadata). */
export function llmErrorFields(err: unknown): Record<string, unknown> {
  if (APICallError.isInstance(err)) {
    const responseBody =
      typeof err.responseBody === 'string' && err.responseBody.trim()
        ? truncateForLog(err.responseBody)
        : undefined
    return {
      errorName: err.name,
      errorMessage: err.message,
      statusCode: err.statusCode,
      url: err.url,
      isRetryable: err.isRetryable,
      ...(responseBody ? { responseBody } : {}),
      ...(err.stack
        ? { errorStack: err.stack.split('\n').slice(0, 8).join('\n') }
        : {}),
    }
  }

  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      ...(err.stack
        ? { errorStack: err.stack.split('\n').slice(0, 8).join('\n') }
        : {}),
    }
  }
  return { errorMessage: String(err) }
}

export function logLlmError(
  message: string,
  err: unknown,
  meta: Record<string, unknown> = {},
): void {
  const summary = formatLlmErrorForUi(err)
  log.error(`${message}: ${summary}`, { ...meta, ...llmErrorFields(err) })
}

/** Log user-visible agent/LLM error text (IPC, transport, step progress). */
export function logAgentUiError(
  message: string,
  meta: Record<string, unknown> = {},
): void {
  log.error(message, meta)
}

export function logLlmWarn(
  message: string,
  err: unknown,
  meta: Record<string, unknown> = {},
): void {
  log.warn(message, { ...meta, ...llmErrorFields(err) })
}


/** User-facing one-line summary for chat error bubbles and IPC. */
export function formatLlmErrorForUi(err: unknown): string {
  const classified = classifyLlmError(err)
  const detail = classified.message.trim() || 'Unknown error'
  const status =
    classified.statusCode != null ? ` HTTP ${classified.statusCode}` : ''
  return `LLM request failed (${classified.category}${status}): ${detail}`
}

/** Markdown chunk for step-progress panels during visible agent runs. */
export function formatLlmErrorProgressChunk(
  err: unknown,
  label?: string,
): string {
  const prefix = label?.trim() ? ` (${label.trim()})` : ''
  return `\n\n${LLM_ERROR_PROGRESS_MARKER}${prefix}: ${formatLlmErrorForUi(err)}\n\n`
}
