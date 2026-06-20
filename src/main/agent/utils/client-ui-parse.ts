/**
 * Client UI message parsing (no form dependencies).
 */
import type { UIMessage } from '@openfde-ai'
import { createLogger } from '@main/logger'

const log = createLogger('agent.utils.client-ui-parse')

export type ClientUiMessage = UIMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isClientUiMessage(value: unknown): value is ClientUiMessage {
  if (!isRecord(value)) return false
  const role = value.role
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return false
  return typeof value.id === 'string' && Array.isArray(value.parts)
}

export function parseClientUiMessages(raw: unknown): ClientUiMessage[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: ClientUiMessage[] = []
  for (const item of raw) {
    if (!isClientUiMessage(item)) {
      log.warn('Skipping invalid client UI message row', {
        role: (item as { role?: string })?.role,
      })
      continue
    }
    out.push(item)
  }
  return out.length > 0 ? out : undefined
}

export function cloneClientUiMessages(
  messages: readonly ClientUiMessage[] | undefined,
): ClientUiMessage[] | undefined {
  if (!messages?.length) return undefined
  try {
    return JSON.parse(JSON.stringify(messages)) as ClientUiMessage[]
  } catch (err) {
    log.warn('cloneClientUiMessages failed', { err })
    return undefined
  }
}
