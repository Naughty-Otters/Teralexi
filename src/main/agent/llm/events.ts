/** Provider-neutral finish reason (mirrors OpenCode LLMEvent). */
export type FinishReason =
  | 'stop'
  | 'length'
  | 'content-filter'
  | 'tool-calls'
  | 'error'
  | 'unknown'
  | 'other'

export type LlmUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
}

export type LlmEvent =
  | { type: 'step-start'; index: number }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; text: string }
  | { type: 'text-end'; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; text: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-input-start'; id: string; name: string }
  | { type: 'tool-input-delta'; id: string; name: string; text: string }
  | { type: 'tool-input-end'; id: string; name: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; name: string; result: unknown }
  | { type: 'tool-error'; id: string; name: string; message: string; error?: unknown }
  | {
      type: 'tool-approval-request'
      toolCallId: string
      approvalId?: string
      payload: Record<string, unknown>
    }
  | {
      type: 'tool-output-denied'
      toolCallId: string
      payload: Record<string, unknown>
    }
  | { type: 'step-finish'; index: number; reason: FinishReason; usage?: LlmUsage }
  | { type: 'finish'; reason: FinishReason; usage?: LlmUsage }
  | { type: 'provider-error'; message: string; retryable?: boolean; error?: unknown }

export function isTextDeltaEvent(
  event: LlmEvent,
): event is Extract<LlmEvent, { type: 'text-delta' }> {
  return event.type === 'text-delta'
}

export function isReasoningDeltaEvent(
  event: LlmEvent,
): event is Extract<LlmEvent, { type: 'reasoning-delta' }> {
  return event.type === 'reasoning-delta'
}

export function isToolCallEvent(
  event: LlmEvent,
): event is Extract<LlmEvent, { type: 'tool-call' }> {
  return event.type === 'tool-call'
}
