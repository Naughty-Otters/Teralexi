import type { ModelMessage } from '@openfde-ai'
import {
  attachInjectorMessageMeta,
  type InjectorMessageMeta,
} from './injection-message-meta'

/** Kimi-style system reminder wrapper appended as a user message. */
export function wrapSystemReminder(content: string): ModelMessage {
  return buildInjectorUserMessage('system-reminder', content)
}

export function buildInjectorUserMessage(
  injectorId: string,
  content: string,
  injectedAt: string = new Date().toISOString(),
): ModelMessage {
  const trimmed = content.trim()
  const meta: InjectorMessageMeta = {
    injectorId: injectorId.trim(),
    injectedAt,
  }
  return attachInjectorMessageMeta(
    {
      role: 'user',
      content: `**${trimmed}**`,
    },
    meta,
  )
}
