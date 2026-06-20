import { HEAD_TAIL_KEEP_CHARS } from '@shared/text/truncate-head-tail'

export const CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY = 'chat.ui.bubbleTextKeepChars'
export const CHAT_UI_BUBBLE_COMPACT_LINES_KEY = 'chat.ui.bubbleCompactLines'
export const CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY = 'chat.ui.contextWindowMessages'

export const CHAT_UI_SETTINGS_PROP_KEYS = [
  CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY,
  CHAT_UI_BUBBLE_COMPACT_LINES_KEY,
  CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY,
] as const

export const MIN_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS = 50
export const MAX_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS = 4_000
export const MIN_CHAT_UI_BUBBLE_COMPACT_LINES = 2
export const MAX_CHAT_UI_BUBBLE_COMPACT_LINES = 24
export const MIN_CHAT_UI_CONTEXT_WINDOW_MESSAGES = 2
export const MAX_CHAT_UI_CONTEXT_WINDOW_MESSAGES = 100

export type ChatUiSettings = {
  /** Characters kept from the start and end of each bubble while streaming/compact. */
  bubbleTextKeepChars: number
  /** Visible line count for collapsed conversation step bubbles. */
  bubbleCompactLines: number
  /** User + assistant turns included in agent conversation context. */
  contextWindowMessages: number
}

export const DEFAULT_CHAT_UI_SETTINGS: ChatUiSettings = {
  bubbleTextKeepChars: HEAD_TAIL_KEEP_CHARS,
  bubbleCompactLines: 10,
  contextWindowMessages: 50,
}

export function clampChatUiBubbleTextKeepChars(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_UI_SETTINGS.bubbleTextKeepChars
  return Math.min(
    MAX_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS,
    Math.max(MIN_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS, Math.round(value)),
  )
}

export function clampChatUiBubbleCompactLines(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_UI_SETTINGS.bubbleCompactLines
  return Math.min(
    MAX_CHAT_UI_BUBBLE_COMPACT_LINES,
    Math.max(MIN_CHAT_UI_BUBBLE_COMPACT_LINES, Math.round(value)),
  )
}

export function clampChatUiContextWindowMessages(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages
  }
  return Math.min(
    MAX_CHAT_UI_CONTEXT_WINDOW_MESSAGES,
    Math.max(MIN_CHAT_UI_CONTEXT_WINDOW_MESSAGES, Math.round(value)),
  )
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  clamp: (n: number) => number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(parsed)) return fallback
  return clamp(parsed)
}

export function parseChatUiSettings(
  values: Record<string, string | undefined>,
): ChatUiSettings {
  return {
    bubbleTextKeepChars: parsePositiveInt(
      values[CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY],
      DEFAULT_CHAT_UI_SETTINGS.bubbleTextKeepChars,
      clampChatUiBubbleTextKeepChars,
    ),
    bubbleCompactLines: parsePositiveInt(
      values[CHAT_UI_BUBBLE_COMPACT_LINES_KEY],
      DEFAULT_CHAT_UI_SETTINGS.bubbleCompactLines,
      clampChatUiBubbleCompactLines,
    ),
    contextWindowMessages: parsePositiveInt(
      values[CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY],
      DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages,
      clampChatUiContextWindowMessages,
    ),
  }
}
