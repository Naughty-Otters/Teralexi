import { describe, expect, it } from 'vitest'
import {
  CHAT_UI_BUBBLE_COMPACT_LINES_KEY,
  CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY,
  CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY,
  CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY,
  CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_MIGRATION_KEY,
  clampChatUiBubbleCompactLines,
  clampChatUiBubbleTextKeepChars,
  clampChatUiContextWindowMessages,
  parseChatUiSettings,
  applyShowAgenticRunBubblesDefaultMigration,
} from './chat-ui-settings'

describe('chat-ui-settings', () => {
  it('clamps bubble text keep chars', () => {
    expect(clampChatUiBubbleTextKeepChars(10)).toBe(50)
    expect(clampChatUiBubbleTextKeepChars(500)).toBe(500)
    expect(clampChatUiBubbleTextKeepChars(9_999)).toBe(9999)
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
      bubbleTextKeepChars: 2_00000,
      bubbleCompactLines: 10,
      contextWindowMessages: 200,
      reasoningMaxChars: 2000,
      toolCallListDisplay: 'compact',
      thinkingBubbleDisplay: 'latest',
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
      reasoningMaxChars: 2000,
      toolCallListDisplay: 'compact',
      thinkingBubbleDisplay: 'latest',
    })
  })

  it('parses tool call list display modes from stored key', () => {
    expect(
      parseChatUiSettings({
        [CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY]: 'latest',
      }).toolCallListDisplay,
    ).toBe('latest')
    expect(
      parseChatUiSettings({
        [CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY]: 'false',
      }).toolCallListDisplay,
    ).toBe('none')
  })

  it('maps legacy boolean storage to display modes', () => {
    expect(
      applyShowAgenticRunBubblesDefaultMigration({
        [CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY]: 'false',
      }).toolCallListDisplay,
    ).toBe('none')
    expect(
      applyShowAgenticRunBubblesDefaultMigration({
        [CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY]: 'true',
      }).toolCallListDisplay,
    ).toBe('all')
  })
})
