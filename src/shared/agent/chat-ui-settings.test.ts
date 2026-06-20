import { describe, expect, it } from 'vitest'
import {
  CHAT_UI_BUBBLE_COMPACT_LINES_KEY,
  CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY,
  CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY,
  clampChatUiBubbleCompactLines,
  clampChatUiBubbleTextKeepChars,
  clampChatUiContextWindowMessages,
  parseChatUiSettings,
} from './chat-ui-settings'

describe('chat-ui-settings', () => {
  it('clamps bubble text keep chars', () => {
    expect(clampChatUiBubbleTextKeepChars(10)).toBe(50)
    expect(clampChatUiBubbleTextKeepChars(500)).toBe(500)
    expect(clampChatUiBubbleTextKeepChars(9_999)).toBe(4_000)
  })

  it('clamps compact line count', () => {
    expect(clampChatUiBubbleCompactLines(1)).toBe(2)
    expect(clampChatUiBubbleCompactLines(6)).toBe(6)
    expect(clampChatUiBubbleCompactLines(99)).toBe(24)
  })

  it('clamps context window message count', () => {
    expect(clampChatUiContextWindowMessages(1)).toBe(2)
    expect(clampChatUiContextWindowMessages(20)).toBe(20)
    expect(clampChatUiContextWindowMessages(999)).toBe(100)
  })

  it('parses stored values with defaults for missing keys', () => {
    expect(parseChatUiSettings({})).toEqual({
      bubbleTextKeepChars: 2_000,
      bubbleCompactLines: 10,
      contextWindowMessages: 50,
    })
  })

  it('parses stored values from system config map', () => {
    expect(
      parseChatUiSettings({
        [CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY]: '480',
        [CHAT_UI_BUBBLE_COMPACT_LINES_KEY]: '8',
        [CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY]: '32',
      }),
    ).toEqual({
      bubbleTextKeepChars: 480,
      bubbleCompactLines: 8,
      contextWindowMessages: 32,
    })
  })
})
