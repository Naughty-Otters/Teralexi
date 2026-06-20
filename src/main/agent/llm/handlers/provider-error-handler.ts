import type { LlmEventForType } from './types'
import { LlmEventHandler } from './types'
import { logLlmError } from '../log-llm-error'

export class ProviderErrorHandler extends LlmEventHandler<'provider-error'> {
  readonly eventType = 'provider-error' as const

  handle(event: LlmEventForType<'provider-error'>) {
    const err =
      event.error != null
        ? event.error
        : new Error(event.message)
    logLlmError('LLM provider error event', err, {
      path: 'ProviderErrorHandler',
      retryable: event.retryable,
    })
    throw err instanceof Error ? err : new Error(event.message)
  }
}
