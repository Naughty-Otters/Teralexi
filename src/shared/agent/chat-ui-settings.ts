import { HEAD_TAIL_KEEP_CHARS } from '@shared/text/truncate-head-tail'

export const CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY = 'chat.ui.bubbleTextKeepChars'
export const CHAT_UI_BUBBLE_COMPACT_LINES_KEY = 'chat.ui.bubbleCompactLines'
export const CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY = 'chat.ui.contextWindowMessages'
export const CHAT_UI_REASONING_MAX_CHARS_KEY = 'chat.ui.reasoningMaxChars'
export const CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY = 'chat.ui.showAgenticRunBubbles'

export const CHAT_UI_SETTINGS_PROP_KEYS = [
  CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY,
  CHAT_UI_BUBBLE_COMPACT_LINES_KEY,
  CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY,
  CHAT_UI_REASONING_MAX_CHARS_KEY,
  CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY,
] as const

export const MIN_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS = 50
export const MAX_CHAT_UI_BUBBLE_TEXT_KEEP_CHARS = 4_00000
export const MIN_CHAT_UI_BUBBLE_COMPACT_LINES = 2
export const MAX_CHAT_UI_BUBBLE_COMPACT_LINES = 24
export const MIN_CHAT_UI_CONTEXT_WINDOW_MESSAGES = 2
export const MAX_CHAT_UI_CONTEXT_WINDOW_MESSAGES = 100
export const DEFAULT_CHAT_UI_REASONING_MAX_CHARS = 2000
export const MIN_CHAT_UI_REASONING_MAX_CHARS = 200
export const MAX_CHAT_UI_REASONING_MAX_CHARS = 20_000

export type ChatUiSettings = {
  /** Characters kept from the start and end of each bubble while streaming/compact. */
  bubbleTextKeepChars: number
  /** Visible line count for collapsed conversation step bubbles. */
  bubbleCompactLines: number
  /** User + assistant turns included in agent conversation context. */
  contextWindowMessages: number
  /** Max visible characters kept per reasoning block (most recent tail). */
  reasoningMaxChars: number
  /** Show Agentic Run step bubbles and tool-loop panels in chat. */
  showAgenticRunBubbles: boolean
}

export const DEFAULT_CHAT_UI_SETTINGS: ChatUiSettings = {
  bubbleTextKeepChars: HEAD_TAIL_KEEP_CHARS,
  bubbleCompactLines: 10,
  contextWindowMessages: 200,
  reasoningMaxChars: DEFAULT_CHAT_UI_REASONING_MAX_CHARS,
  showAgenticRunBubbles: true,
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

export function clampChatUiReasoningMaxChars(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CHAT_UI_SETTINGS.reasoningMaxChars
  }
  return Math.min(
    MAX_CHAT_UI_REASONING_MAX_CHARS,
    Math.max(MIN_CHAT_UI_REASONING_MAX_CHARS, Math.round(value)),
  )
}

export function parseChatUiBoolean(
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = raw.trim().toLowerCase()
  if (value === 'true' || value === '1' || value === 'yes') return true
  if (value === 'false' || value === '0' || value === 'no') return false
  return fallback
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
    reasoningMaxChars: parsePositiveInt(
      values[CHAT_UI_REASONING_MAX_CHARS_KEY],
      DEFAULT_CHAT_UI_SETTINGS.reasoningMaxChars,
      clampChatUiReasoningMaxChars,
    ),
    showAgenticRunBubbles: parseChatUiBoolean(
      values[CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY],
      DEFAULT_CHAT_UI_SETTINGS.showAgenticRunBubbles,
    ),
  }
}
