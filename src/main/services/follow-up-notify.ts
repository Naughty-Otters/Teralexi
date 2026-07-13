import { BrowserWindow } from 'electron'
import type { FollowUpItem } from '@shared/agent/follow-up'
import { webContentSend } from '@main/services/web-content-send'

/** Push follow-up catalog updates to all renderer windows. */
export function notifyConversationFollowUpsChanged(
  conversationId: string,
  followUps: FollowUpItem[],
): void {
  const id = conversationId.trim()
  if (!id) return
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.ConversationFollowUpsChanged(window.webContents, {
      conversationId: id,
      followUps,
    })
  }
}
