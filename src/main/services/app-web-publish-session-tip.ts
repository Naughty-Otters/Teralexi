import { getConversationStore } from '@main/services/conversation-store'
import { notifyConversationStoreChanged } from '@main/services/conversation-store-notify'
import { createLogger } from '@main/logger'
import { randomShortUuid } from '@shared/utils/short-uuid'

const log = createLogger('services.app-web-publish-session-tip')

/** Markdown tip written into the conversation after a successful publish. */
export function formatWebsitePublishedSessionTip(absoluteUrl: string): string {
  return absoluteUrl.trim()
}

/**
 * Append an assistant tip with the public URL to the conversation transcript.
 * Persists via the conversation store and notifies the renderer to refresh.
 */
export function appendWebsitePublishedSessionTip(args: {
  conversationId: string
  absoluteUrl: string
}): { ok: boolean; messageId?: string; error?: string } {
  const conversationId = args.conversationId.trim()
  const absoluteUrl = args.absoluteUrl.trim()
  if (!conversationId) {
    return { ok: false, error: 'Missing conversation id' }
  }
  if (!absoluteUrl) {
    return { ok: false, error: 'Missing public URL' }
  }

  try {
    const store = getConversationStore()
    const conversation = store.getConversation(conversationId)
    if (!conversation?.agentId) {
      return { ok: false, error: 'Conversation not found' }
    }

    const messageId = randomShortUuid()
    store.saveMessage({
      id: messageId,
      conversationId,
      agentId: conversation.agentId,
      role: 'assistant',
      content: formatWebsitePublishedSessionTip(absoluteUrl),
      createdAt: new Date().toISOString(),
    })
    notifyConversationStoreChanged(conversationId, conversation.agentId)
    return { ok: true, messageId }
  } catch (err) {
    log.warn('Failed to append publish session tip', {
      conversationId,
      err,
    })
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
