import { DEFAULT_CHAT_UI_SETTINGS } from '@shared/agent/chat-ui-settings'
import type { ModelMessage } from '@teralexi-ai'
import type { AgentMessage } from '../types'
import { truncateString } from './str-utils'

const DEFAULT_MAX_CHARS_PER_MESSAGE = 1_200

export type BuildHistoryModelMessagesOpts = {
  maxMessages?: number
  maxCharsPerMessage?: number
}

/** Map agent turns to model messages (optional per-message char cap). */
export function mapAgentMessagesToModelMessages(
  messages: readonly AgentMessage[],
  opts: Pick<BuildHistoryModelMessagesOpts, 'maxCharsPerMessage'> = {},
): ModelMessage[] {
  const maxChars = opts.maxCharsPerMessage ?? DEFAULT_MAX_CHARS_PER_MESSAGE

  return messages
    .map((m) => ({
      role: m.role,
      content: truncateString(m.content, maxChars),
    }))
    .filter((m) => m.content.trim().length > 0) as ModelMessage[]
}

/**
 * Convert persisted / in-run conversation history to model messages for the tool loop.
 * Used when rich client UI replay is unavailable (channels, tests).
 */
export function buildHistoryModelMessages(
  messages: readonly AgentMessage[],
  opts: BuildHistoryModelMessagesOpts = {},
): ModelMessage[] {
  const maxMessages =
    opts.maxMessages ?? DEFAULT_CHAT_UI_SETTINGS.contextWindowMessages

  return mapAgentMessagesToModelMessages(messages.slice(-maxMessages), opts)
}
