import type { ModelMessage } from '@teralexi-ai'
import { extractTrailingUserForPersistence } from '../utils/client-ui-messages'
import type { ClientUiMessage } from '../utils/client-ui-parse'
import {
  CURRENT_DATETIME_INJECTOR_MARKER,
  readUserMessageText,
} from './injection-message-content'
import { readInjectorMessageMeta } from './injection-message-meta'

export type UserMessageIdentity = {
  id: string
  createdAt?: string
}

export type PendingUserMessage = {
  id: string
  content: string
  createdAt: string
}

function readPendingUserTurn(
  pending?: PendingUserMessage,
): UserMessageIdentity | undefined {
  const id = pending?.id?.trim()
  const content = pending?.content?.trim()
  if (!id || !content) return undefined
  const createdAt = pending?.createdAt?.trim()
  return {
    id,
    createdAt: createdAt || undefined,
  }
}

function isInjectedUserMessage(message: ModelMessage): boolean {
  if (message.role !== 'user') return false
  if (readInjectorMessageMeta(message)?.injectorId) return true
  const text = readUserMessageText(message)
  return text.includes(CURRENT_DATETIME_INJECTOR_MARKER)
}

function readLatestUserTurnFromModelMessages(
  messages: readonly ModelMessage[],
): UserMessageIdentity | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user' || isInjectedUserMessage(message)) continue
    const content = readUserMessageText(message).trim()
    if (!content) continue
    return {
      id: `user-content:${content.slice(0, 160)}`,
      createdAt: undefined,
    }
  }

  return undefined
}

/**
 * Stable user-turn identity for injection dedupe.
 * Prefers persisted UI rows (same helpers as conversation history), then
 * pending IPC user rows, then the latest non-injector model user message.
 */
export function resolveLatestUserMessageIdentity(args: {
  clientUiMessages?: readonly ClientUiMessage[]
  pendingUserMessage?: PendingUserMessage
  modelMessages?: readonly ModelMessage[]
}): UserMessageIdentity | undefined {
  const fromUi = extractTrailingUserForPersistence(args.clientUiMessages)
  if (fromUi) {
    return {
      id: fromUi.id,
      createdAt: fromUi.createdAt,
    }
  }

  const fromPending = readPendingUserTurn(args.pendingUserMessage)
  if (fromPending) return fromPending

  return readLatestUserTurnFromModelMessages(args.modelMessages ?? [])
}
