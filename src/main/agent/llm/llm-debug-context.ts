import type { LlmDebugToolCallRecord } from './llm-debug-tool-calls'
import type { LlmDebugRuntimeSnapshot } from './llm-debug-runtime-context'

export type LlmDebugContextSnapshot = {
  instructions?: string
  messages: unknown[]
  meta: {
    messageCount: number
    toolCallCount?: number
    hasAssistantText?: boolean
    hasStructuredOutput?: boolean
  }
  /** Serialized AgentStepContext / AgentFlowContext / nested context classes. */
  runtime?: LlmDebugRuntimeSnapshot
}

export function buildContextBefore(params: {
  instructions?: string
  messages: unknown[]
  runtime?: LlmDebugRuntimeSnapshot
}): LlmDebugContextSnapshot {
  const messages = cloneMessages(params.messages)
  return {
    instructions: params.instructions?.trim() || undefined,
    messages,
    meta: {
      messageCount: messages.length,
    },
    runtime: params.runtime,
  }
}

export function buildContextAfter(params: {
  instructions?: string
  messagesBefore: unknown[]
  assistantText?: string
  toolCalls?: LlmDebugToolCallRecord[]
  structuredOutput?: unknown
  runtime?: LlmDebugRuntimeSnapshot
}): LlmDebugContextSnapshot {
  const messages = cloneMessages(params.messagesBefore)
  const toolCalls = params.toolCalls ?? []

  if (toolCalls.length > 0) {
    messages.push({
      role: 'assistant',
      content: toolCalls.map((tc) => ({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.name,
        input: tc.input,
      })),
    })

    for (const tc of toolCalls) {
      if (tc.status === 'denied') {
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: tc.id,
              toolName: tc.name,
              output: { denied: true },
            },
          ],
        })
        continue
      }
      if (tc.status === 'error') {
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: tc.id,
              toolName: tc.name,
              output: { error: tc.error ?? 'tool error' },
            },
          ],
        })
        continue
      }
      if (tc.output !== undefined) {
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: tc.id,
              toolName: tc.name,
              output: tc.output,
            },
          ],
        })
      }
    }
  }

  const assistantText = params.assistantText?.trim()
  if (assistantText) {
    messages.push({ role: 'assistant', content: assistantText })
  } else if (params.structuredOutput !== undefined) {
    messages.push({
      role: 'assistant',
      content: JSON.stringify(params.structuredOutput, null, 2),
      structuredOutput: params.structuredOutput,
    })
  }

  return {
    instructions: params.instructions?.trim() || undefined,
    messages,
    meta: {
      messageCount: messages.length,
      toolCallCount: toolCalls.length,
      hasAssistantText: Boolean(assistantText),
      hasStructuredOutput: params.structuredOutput !== undefined,
    },
    runtime: params.runtime,
  }
}

function cloneMessages(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return []
  try {
    return structuredClone(messages)
  } catch {
    return JSON.parse(JSON.stringify(messages)) as unknown[]
  }
}
