import type { FinishReason, LlmEvent, LlmUsage } from './events'
import { logLlmError } from './log-llm-error'

export type AiSdkAdapterState = {
  step: number
  text: number
  reasoning: number
  currentTextID: string | undefined
  currentReasoningID: string | undefined
  toolNames: Record<string, string>
}

export function createAiSdkAdapterState(): AiSdkAdapterState {
  return {
    step: 0,
    text: 0,
    reasoning: 0,
    currentTextID: undefined,
    currentReasoningID: undefined,
    toolNames: {},
  }
}

function finishReason(value: string | undefined): FinishReason {
  const allowed: FinishReason[] = [
    'stop',
    'length',
    'content-filter',
    'tool-calls',
    'error',
    'unknown',
    'other',
  ]
  return allowed.includes(value as FinishReason)
    ? (value as FinishReason)
    : 'unknown'
}

function usageFromUnknown(value: unknown): LlmUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    reasoningTokens?: number
    cachedInputTokens?: number
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }
    outputTokenDetails?: { reasoningTokens?: number }
  }
  const entries = Object.entries({
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    totalTokens: item.totalTokens,
    reasoningTokens:
      item.outputTokenDetails?.reasoningTokens ?? item.reasoningTokens,
    cacheReadInputTokens:
      item.inputTokenDetails?.cacheReadTokens ?? item.cachedInputTokens,
    cacheWriteInputTokens: item.inputTokenDetails?.cacheWriteTokens,
  }).filter((entry) => entry[1] !== undefined)
  return entries.length === 0
    ? undefined
    : (Object.fromEntries(entries) as LlmUsage)
}

function currentTextID(state: AiSdkAdapterState, id: string | undefined): string {
  state.currentTextID = id ?? state.currentTextID ?? `text-${state.text++}`
  return state.currentTextID
}

function currentReasoningID(
  state: AiSdkAdapterState,
  id: string | undefined,
): string {
  state.currentReasoningID =
    id ?? state.currentReasoningID ?? `reasoning-${state.reasoning++}`
  return state.currentReasoningID
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Map one AI SDK `fullStream` event to zero or more {@link LlmEvent}s. */
export function aiSdkEventToLlmEvents(
  state: AiSdkAdapterState,
  event: Record<string, unknown>,
): LlmEvent[] {
  const type = event.type
  if (typeof type !== 'string') return []

  switch (type) {
    case 'start':
      return []

    case 'start-step':
      return [{ type: 'step-start', index: state.step }]

    case 'finish-step':
      return [
        {
          type: 'step-finish',
          index: state.step++,
          reason: finishReason(event.finishReason as string | undefined),
          usage: usageFromUnknown(event.usage),
        },
      ]

    case 'finish': {
      const events: LlmEvent[] = [
        {
          type: 'finish',
          reason: finishReason(event.finishReason as string | undefined),
          usage: usageFromUnknown(event.totalUsage),
        },
      ]
      Object.assign(state, createAiSdkAdapterState())
      return events
    }

    case 'text-start': {
      state.currentTextID = currentTextID(state, event.id as string | undefined)
      return [{ type: 'text-start', id: state.currentTextID }]
    }

    case 'text-delta':
      return [
        {
          type: 'text-delta',
          id: currentTextID(state, event.id as string | undefined),
          text: String(event.text ?? ''),
        },
      ]

    case 'text-end': {
      const id = currentTextID(state, event.id as string | undefined)
      state.currentTextID = undefined
      return [{ type: 'text-end', id }]
    }

    case 'reasoning-start': {
      state.currentReasoningID = currentReasoningID(
        state,
        event.id as string | undefined,
      )
      return [{ type: 'reasoning-start', id: state.currentReasoningID }]
    }

    case 'reasoning-delta':
      return [
        {
          type: 'reasoning-delta',
          id: currentReasoningID(state, event.id as string | undefined),
          text: String(event.text ?? ''),
        },
      ]

    case 'reasoning-end': {
      const id = currentReasoningID(state, event.id as string | undefined)
      state.currentReasoningID = undefined
      return [{ type: 'reasoning-end', id }]
    }

    case 'tool-input-start': {
      const id = String(event.id ?? '')
      const name = String(event.toolName ?? 'unknown')
      state.toolNames[id] = name
      return [{ type: 'tool-input-start', id, name }]
    }

    case 'tool-input-delta': {
      const id = String(event.id ?? '')
      return [
        {
          type: 'tool-input-delta',
          id,
          name: state.toolNames[id] ?? 'unknown',
          text: String(event.delta ?? ''),
        },
      ]
    }

    case 'tool-input-end': {
      const id = String(event.id ?? '')
      return [
        {
          type: 'tool-input-end',
          id,
          name: state.toolNames[id] ?? 'unknown',
        },
      ]
    }

    case 'tool-call': {
      const id = String(event.toolCallId ?? '')
      const name = String(event.toolName ?? 'unknown')
      state.toolNames[id] = name
      return [{ type: 'tool-call', id, name, input: event.input }]
    }

    case 'tool-result': {
      const id = String(event.toolCallId ?? '')
      const name = state.toolNames[id] ?? 'unknown'
      delete state.toolNames[id]
      return [{ type: 'tool-result', id, name, result: event.output }]
    }

    case 'tool-error': {
      const id = String(event.toolCallId ?? '')
      const name =
        state.toolNames[id] ??
        (typeof event.toolName === 'string' ? event.toolName : 'unknown')
      delete state.toolNames[id]
      return [
        {
          type: 'tool-error',
          id,
          name,
          message: errorMessage(event.error),
          error: event.error,
        },
      ]
    }

    case 'error':
      return [
        {
          type: 'provider-error',
          message: errorMessage(event.error),
          error: event.error,
        },
      ]

    case 'tool-approval-request': {
      const toolCallId = String(event.toolCallId ?? '')
      const approvalId =
        typeof event.approvalId === 'string' ? event.approvalId : undefined
      return [
        {
          type: 'tool-approval-request',
          toolCallId,
          approvalId,
          payload: event,
        },
      ]
    }

    case 'tool-output-denied': {
      const toolCallId = String(event.toolCallId ?? '')
      return [
        {
          type: 'tool-output-denied',
          toolCallId,
          payload: event,
        },
      ]
    }

    case 'abort':
    case 'source':
    case 'file':
    case 'raw':
      return []

    default:
      return []
  }
}

/** Drain an AI SDK `fullStream` into {@link LlmEvent}s. */
export async function drainFullStreamToLlmEvents(
  fullStream: AsyncIterable<unknown>,
  onEvent: (event: LlmEvent) => void,
): Promise<void> {
  const state = createAiSdkAdapterState()
  for await (const raw of fullStream) {
    const rec =
      raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : { type: 'unknown' }
    for (const event of aiSdkEventToLlmEvents(state, rec)) {
      onEvent(event)
      if (event.type === 'provider-error') {
        const providerErr =
          'error' in event && event.error != null
            ? event.error
            : new Error(event.message)
        logLlmError('Provider error in LLM stream', providerErr, {
          path: 'drainFullStreamToLlmEvents',
          retryable: event.retryable,
        })
        throw providerErr instanceof Error ? providerErr : new Error(event.message)
      }
    }
  }
}

/** Synthesize {@link LlmEvent}s from a plain `textStream` when `fullStream` is unavailable. */
export async function drainTextStreamToLlmEvents(
  textStream: AsyncIterable<string>,
  onEvent: (event: LlmEvent) => void,
): Promise<void> {
  const id = 'text-0'
  onEvent({ type: 'text-start', id })
  for await (const chunk of textStream) {
    if (chunk) onEvent({ type: 'text-delta', id, text: chunk })
  }
  onEvent({ type: 'text-end', id })
  onEvent({ type: 'finish', reason: 'stop' })
}
