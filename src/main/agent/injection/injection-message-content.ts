import type { ModelMessage } from '@openfde-ai'

export const CURRENT_DATETIME_INJECTOR_MARKER = '## Current date and time'

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

export function messagesContainCurrentDatetimeBlock(
  messages: readonly ModelMessage[],
): boolean {
  return messages.some((message) =>
    readUserMessageText(message).includes(CURRENT_DATETIME_INJECTOR_MARKER),
  )
}
