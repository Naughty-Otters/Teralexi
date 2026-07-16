import { BrowserWindow } from 'electron'
import type { FollowUpItem } from '@shared/agent/follow-up'
import { webContentSend } from '@main/services/web-content-send'

/** Push follow-up catalog updates to all renderer windows. */
export function notifyConversationFollowUpsChanged(
  conversationId: string,
  followUps: FollowUpItem[],
  revision: number,
): void {
  const id = conversationId.trim()
  if (!id) return
  try {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue
      webContentSend.ConversationFollowUpsChanged(window.webContents, {
        conversationId: id,
        followUps,
        revision,
      })
    }
  } catch {
    // Electron may be unavailable in unit tests; persistence already succeeded.
  }
}
