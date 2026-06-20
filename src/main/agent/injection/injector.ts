import type { ModelMessage } from '@openfde-ai'

/** Kimi-style system reminder wrapper appended as a user message. */
export function wrapSystemReminder(content: string): ModelMessage {
  const trimmed = content.trim()
  return {
    role: 'user',
    content: `**${trimmed}**`,
  }
}
