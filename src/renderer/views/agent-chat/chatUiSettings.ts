import { ref } from 'vue'
import {
  CHAT_UI_BUBBLE_COMPACT_LINES_KEY,
  CHAT_UI_BUBBLE_TEXT_KEEP_CHARS_KEY,
  CHAT_UI_CONTEXT_WINDOW_MESSAGES_KEY,
  CHAT_UI_REASONING_MAX_CHARS_KEY,
  CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY,
  CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_MIGRATION_KEY,
  CHAT_UI_SETTINGS_PROP_KEYS,
  DEFAULT_CHAT_UI_SETTINGS,
  applyShowAgenticRunBubblesDefaultMigration,
  shouldPersistShowAgenticRunBubblesMigration,
  clampChatUiBubbleCompactLines,
  clampChatUiBubbleTextKeepChars,
  clampChatUiContextWindowMessages,
  clampChatUiReasoningMaxChars,
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
export const chatUiReasoningMaxChars = ref(
  DEFAULT_CHAT_UI_SETTINGS.reasoningMaxChars,
)
export const chatUiShowAgenticRunBubbles = ref(
  DEFAULT_CHAT_UI_SETTINGS.showAgenticRunBubbles,
)

/** Head/tail cap for sub-agent streaming bubbles only (main assistant text is full). */
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
  chatUiReasoningMaxChars.value = clampChatUiReasoningMaxChars(
    settings.reasoningMaxChars,
  )
  chatUiShowAgenticRunBubbles.value = settings.showAgenticRunBubbles
}

export async function loadChatUiSettings(): Promise<ChatUiSettings> {
  const values = await getSystemConfigValues([
    ...CHAT_UI_SETTINGS_PROP_KEYS,
    CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_MIGRATION_KEY,
  ])
  const parsed = applyShowAgenticRunBubblesDefaultMigration(values)
  if (shouldPersistShowAgenticRunBubblesMigration(values)) {
    if (values[CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY] === 'false') {
      await setSystemConfigValue(CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY, 'true')
    }
    await setSystemConfigValue(
      CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_MIGRATION_KEY,
      'true',
    )
  }
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
    reasoningMaxChars: clampChatUiReasoningMaxChars(settings.reasoningMaxChars),
    showAgenticRunBubbles: settings.showAgenticRunBubbles,
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
    setSystemConfigValue(
      CHAT_UI_REASONING_MAX_CHARS_KEY,
      String(next.reasoningMaxChars),
    ),
    setSystemConfigValue(
      CHAT_UI_SHOW_AGENTIC_RUN_BUBBLES_KEY,
      String(next.showAgenticRunBubbles),
    ),
  ])
  applyChatUiSettings(next)
  return next
}
