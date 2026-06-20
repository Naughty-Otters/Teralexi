import { ref } from 'vue'
import {
  CHAT_UI_BUBBLE_COMPACT_LINES_KEY,
  CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY,
  CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY,
  CHAT_UI_SETTINGS_PROP_KEYS,
  DEFAULT_CHAT_UI_SETTINGS,
  clampChatUiBubbleCompactLines,
  clampChatUiBubbleTextKeepChars,
  clampChatUiContextWindowMessages,
  parseChatUiSettings,
  type ChatUiSettings,
} from '@shared/agent/chat-ui-settings'
import {
  getSystemConfigValues,
  setSystemConfigValue,
} from '@store/agent/config'
import { limitTextForStreamingBubble } from './streamingBubbleTextLimit'

export const chatUiBubbleTextKeepChars = ref(
  DEFAULT_CHAT_UI_SETTINGS.bubbleTextKeepChars,
)
export const chatUiBubbleCompactLines = ref(
  DEFAULT_CHAT_UI_SETTINGS.bubbleCompactLines,
)
export const chatUiContextWindowMessages = ref(
  DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages,
)

export function limitBubbleTextForDisplay(text: string): string {
  return limitTextForStreamingBubble(
    text,
    chatUiBubbleTextKeepChars.value,
  )
}

export function chatUiBubbleCssVars(): Record<string, string> {
  return {
    '--chat-bubble-compact-lines': String(chatUiBubbleCompactLines.value),
  }
}

export function applyChatUiSettings(settings: ChatUiSettings): void {
  chatUiBubbleTextKeepChars.value = clampChatUiBubbleTextKeepChars(
    settings.bubbleTextKeepChars,
  )
  chatUiBubbleCompactLines.value = clampChatUiBubbleCompactLines(
    settings.bubbleCompactLines,
  )
  chatUiContextWindowMessages.value = clampChatUiContextWindowMessages(
    settings.contextWindowMessages,
  )
}

export async function loadChatUiSettings(): Promise<ChatUiSettings> {
  const values = await getSystemConfigValues([...CHAT_UI_SETTINGS_PROP_KEYS])
  const parsed = parseChatUiSettings(values)
  applyChatUiSettings(parsed)
  return parsed
}

export async function saveChatUiSettings(
  settings: ChatUiSettings,
): Promise<ChatUiSettings> {
  const next: ChatUiSettings = {
    bubbleTextKeepChars: clampChatUiBubbleTextKeepChars(
      settings.bubbleTextKeepChars,
    ),
    bubbleCompactLines: clampChatUiBubbleCompactLines(
      settings.bubbleCompactLines,
    ),
    contextWindowMessages: clampChatUiContextWindowMessages(
      settings.contextWindowMessages,
    ),
  }
  await Promise.all([
    setSystemConfigValue(
      CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY,
      String(next.bubbleTextKeepChars),
    ),
    setSystemConfigValue(
      CHAT_UI_BUBBLE_COMPACT_LINES_KEY,
      String(next.bubbleCompactLines),
    ),
    setSystemConfigValue(
      CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY,
      String(next.contextWindowMessages),
    ),
  ])
  applyChatUiSettings(next)
  return next
}
