import { BrowserWindow } from 'electron'
import { webContentSend } from '@main/services/web-content-send'

export function notifyConversationStoreChanged(
  conversationId: string,
  agentId: string,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.ConversationStoreChanged(window.webContents, {
      conversationId,
      agentId,
    })
  }
}
