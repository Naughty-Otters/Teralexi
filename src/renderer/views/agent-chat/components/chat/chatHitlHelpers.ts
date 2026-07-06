import type { UIMessage } from '@teralexi-ai'
import { collectFormRequestId, isCollectFormRequestPart } from './collectFormTypes'
import { toolPartNeedsApproval } from './chatToolPartHelpers'

function userMessageAnswersFormRequest(
  message: UIMessage,
  requestId: string,
): boolean {
  if (message.role !== 'user') return false
  return message.parts.some((part) => {
    const type = (part as { type?: string }).type
    const id = (part as { id?: string }).id?.trim()
    return type === 'data-collect-form-response' && id === requestId
  })
}

/** True when the latest assistant row still needs form submit or tool approval. */
export function chatMessagesHavePendingHitl(
  messages: readonly UIMessage[],
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    for (const part of msg.parts) {
      if (toolPartNeedsApproval(part)) return true

      if (isCollectFormRequestPart(part)) {
        const requestId = collectFormRequestId(part)
        if (!requestId) return true
        const answered = messages
          .slice(i + 1)
          .some((m) => userMessageAnswersFormRequest(m, requestId))
        if (!answered) return true
      }
    }
    return false
  }
  return false
}
