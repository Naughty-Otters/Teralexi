import type { UIMessage } from '@openfde-ai'

/**
 * After form submit user message, auto-continue agent run (same idea as tool approval).
 */
export function lastAssistantMessageIsCompleteWithCollectFormResponses(opts: {
  messages: UIMessage[]
}): boolean {
  const { messages } = opts
  if (messages.length < 2) return false
  const last = messages[messages.length - 1]
  const prev = messages[messages.length - 2]
  if (last.role !== 'user' || prev.role !== 'assistant') return false

  const respPart = last.parts.find(
    (p) => (p as { type?: string }).type === 'data-collect-form-response',
  ) as { id?: string } | undefined
  if (!respPart?.id) return false

  const reqPart = prev.parts.find((p) => {
    const x = p as { type?: string; id?: string }
    return x.type === 'data-collect-form-request' && x.id === respPart.id
  })
  return !!reqPart
}
