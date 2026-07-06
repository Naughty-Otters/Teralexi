import type { ModelMessage } from '@teralexi-ai'
import { readInjectorMessageMeta } from './injection-message-meta'

export const CURRENT_DATETIME_INJECTOR_MARKER = '## Current date and time'
export const USER_UPLOADS_INJECTOR_MARKER = '### User-uploaded files'

function isInjectedUserMessage(message: ModelMessage): boolean {
  if (message.role !== 'user') return false
  if (readInjectorMessageMeta(message)?.injectorId) return true
  const text = readUserMessageText(message)
  return text.includes(CURRENT_DATETIME_INJECTOR_MARKER)
}

export function readUserMessageText(message: ModelMessage): string {
  if (message.role !== 'user') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const lines: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const text = (part as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) lines.push(text)
  }
  return lines.join('\n')
}

function writeUserMessageText(message: ModelMessage, text: string): ModelMessage {
  const content = message.content
  if (typeof content === 'string') {
    return { ...message, content: text }
  }
  if (Array.isArray(content)) {
    let replaced = false
    const nextParts = content.map((part) => {
      if (!part || typeof part !== 'object') return part
      const typed = part as { type?: unknown; text?: unknown }
      if (typed.type === 'text' && typeof typed.text === 'string') {
        replaced = true
        return { ...typed, text }
      }
      return part
    })
    if (replaced) return { ...message, content: nextParts }
  }
  return { ...message, content: text }
}

/** Append a suffix to the latest real user message (skips injector rows). */
export function appendSuffixToTrailingUserMessage(
  messages: readonly ModelMessage[],
  suffix: string,
  options?: { dedupeMarker?: string },
): ModelMessage[] {
  const block = suffix.trim()
  if (!block) return [...messages]

  const dedupeMarker = options?.dedupeMarker?.trim()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user' || isInjectedUserMessage(message)) continue
    const existing = readUserMessageText(message).trim()
    if (!existing) continue
    if (dedupeMarker && existing.includes(dedupeMarker)) return [...messages]

    const updated = [...messages]
    updated[index] = writeUserMessageText(message, `${existing}\n\n${block}`)
    return updated
  }

  return [...messages]
}

export function messagesContainCurrentDatetimeBlock(
  messages: readonly ModelMessage[],
): boolean {
  return messages.some((message) =>
    readUserMessageText(message).includes(CURRENT_DATETIME_INJECTOR_MARKER),
  )
}
