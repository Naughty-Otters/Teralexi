import type { ModelMessage } from '@openfde-ai'
import { findLastInjectorMessageMeta } from './injection-message-meta'
import { getLastDeepThinkingInjection } from './deep-thinking-injection-state'
import { readUserMessageText } from './injection-message-content'

export const DEEP_THINKING_BEFORE_ANSWER_TEXT =
  'Before answering, think a comprehensive breakdown of the problem. Outline few potential solutions, evaluate the pros and cons of each, and **only write down the final solution**.'

export const DEEP_THINKING_AFTER_ANSWER_TEXT =
  'After drafting your response, review it. Point out any logical flaws or missing details, and rewrite the answer to fix them.'

export const DEEP_THINKING_BEFORE_MARKER =
  'Before answering, think a comprehensive breakdown of the problem.'

export const DEEP_THINKING_AFTER_MARKER =
  'After drafting your response, review it'

export const MULTIPLE_BRANCH_THINKING_TEXT =
  'Evaluate multiple branches of logic and explore different reasoning paths before committing to one, write the final commit message.'

export const MULTIPLE_BRANCH_THINKING_MARKER =
  'Evaluate multiple branches of logic and explore different reasoning paths'

export type ShouldInjectDeepThinkingOptions = {
  conversationId?: string
  latestUserMessageId?: string
  latestUserMessageAt?: string
}

export function messagesContainDeepThinkingBeforeBlock(
  messages: readonly ModelMessage[],
): boolean {
  return messages.some((message) =>
    readUserMessageText(message).includes(DEEP_THINKING_BEFORE_MARKER),
  )
}

export function messagesContainDeepThinkingAfterBlock(
  messages: readonly ModelMessage[],
): boolean {
  return messages.some((message) =>
    readUserMessageText(message).includes(DEEP_THINKING_AFTER_MARKER),
  )
}

export function shouldInjectDeepThinkingBeforeAnswer(
  messages: readonly ModelMessage[],
  options: ShouldInjectDeepThinkingOptions = {},
): boolean {
  const turnId = options.latestUserMessageId?.trim()
  const conversationId = options.conversationId?.trim()

  if (turnId && conversationId) {
    const last = getLastDeepThinkingInjection(conversationId)
    if (last?.userMessageId === turnId && last.beforeInjectedAt) return false
  }

  if (!turnId) {
    return !messagesContainDeepThinkingBeforeBlock(messages)
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const text = readUserMessageText(message)
    if (text.includes(DEEP_THINKING_BEFORE_MARKER)) {
      return false
    }
    if (text.trim()) return true
  }

  return !messagesContainDeepThinkingBeforeBlock(messages)
}

export function messagesContainMultipleBranchThinkingBlock(
  messages: readonly ModelMessage[],
): boolean {
  return messages.some((message) =>
    readUserMessageText(message).includes(MULTIPLE_BRANCH_THINKING_MARKER),
  )
}

export function shouldInjectMultipleBranchThinking(
  messages: readonly ModelMessage[],
  options: ShouldInjectDeepThinkingOptions = {},
): boolean {
  const turnId = options.latestUserMessageId?.trim()
  const conversationId = options.conversationId?.trim()

  if (turnId && conversationId) {
    const last = getLastDeepThinkingInjection(conversationId)
    if (last?.userMessageId === turnId && last.multipleBranchInjectedAt) {
      return false
    }
  }

  if (!turnId) {
    return !messagesContainMultipleBranchThinkingBlock(messages)
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const text = readUserMessageText(message)
    if (text.includes(MULTIPLE_BRANCH_THINKING_MARKER)) {
      return false
    }
    if (text.trim()) return true
  }

  return !messagesContainMultipleBranchThinkingBlock(messages)
}

export function shouldInjectDeepThinkingAfterAnswer(
  messages: readonly ModelMessage[],
  options: ShouldInjectDeepThinkingOptions = {},
): boolean {
  const turnId = options.latestUserMessageId?.trim()
  const conversationId = options.conversationId?.trim()

  if (turnId && conversationId) {
    const last = getLastDeepThinkingInjection(conversationId)
    if (last?.userMessageId === turnId && last.afterInjectedAt) return false
  }

  if (findLastInjectorMessageMeta(messages, 'deep-thinking-after-answer')) {
    return false
  }

  if (messagesContainDeepThinkingAfterBlock(messages)) return false

  return lastAssistantDraftIsTextOnly(messages) != null
}

export function readAssistantMessageText(message: ModelMessage): string {
  if (message.role !== 'assistant') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const lines: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const type = (part as { type?: unknown }).type
    if (type !== 'text') continue
    const text = (part as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) lines.push(text)
  }
  return lines.join('\n')
}

export function assistantMessageHasToolCalls(message: ModelMessage): boolean {
  if (message.role !== 'assistant') return false
  const content = message.content
  if (!Array.isArray(content)) return false
  return content.some(
    (part) =>
      part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'tool-call',
  )
}

/** Latest assistant row that ends with user-facing prose (no trailing tool calls). */
export function lastAssistantDraftIsTextOnly(
  messages: readonly ModelMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    if (assistantMessageHasToolCalls(message)) return null
    const text = readAssistantMessageText(message).trim()
    if (text) return text
    return null
  }
  return null
}
