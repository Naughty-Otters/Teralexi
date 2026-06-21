import { getSystemPropValues } from '@config/system-prop'
import {
  CHAT_UI_SETTINGS_PROP_KEYS,
  parseChatUiSettings,
} from '@shared/agent/chat-ui-settings'

/** User-configured agent history window (Settings → Chat). */
export function loadChatContextWindowMessages(): number {
  const values = getSystemPropValues([...CHAT_UI_SETTINGS_PROP_KEYS])
  return parseChatUiSettings(values).contextWindowMessages
}

/** Max visible characters per reasoning block (Settings → Chat). */
export function loadChatUiReasoningMaxChars(): number {
  const values = getSystemPropValues([...CHAT_UI_SETTINGS_PROP_KEYS])
  return parseChatUiSettings(values).reasoningMaxChars
}
