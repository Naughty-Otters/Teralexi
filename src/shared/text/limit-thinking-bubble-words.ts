import { DEFAULT_CHAT_UI_REASONING_MAX_CHARS } from '@shared/agent/chat-ui-settings'

/** Hard ceiling for Thinking / reasoning bubble body text in the chat UI. */
export const THINKING_BUBBLE_MAX_WORDS = DEFAULT_CHAT_UI_REASONING_MAX_CHARS

export const THINKING_BUBBLE_WORDS_OMISSION =
  '\n…[earlier thinking omitted]\n'

export function countThinkingBubbleWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Keep at most `maxWords` words (most recent tail). Older text is replaced with
 * a short omission marker so the Thinking bubble cannot grow unbounded.
 */
export function limitThinkingBubbleWords(
  text: string,
  maxWords: number = THINKING_BUBBLE_MAX_WORDS,
): string {
  if (!text || maxWords <= 0) return text
  // Impossible to exceed the word budget if there aren't enough characters.
  if (text.length <= maxWords) return text
  if (countThinkingBubbleWords(text) <= maxWords) return text

  const words = text.trim().split(/\s+/)
  return `${THINKING_BUBBLE_WORDS_OMISSION}${words.slice(-maxWords).join(' ')}`
}
