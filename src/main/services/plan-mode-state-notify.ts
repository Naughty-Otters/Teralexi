import { BrowserWindow } from 'electron'
import type { PlanModeView } from '@shared/agent/plan-mode-phase'
import { webContentSend } from '@main/services/web-content-send'

/** Push plan-mode transitions to all renderer windows (composer banner, etc.). */
export function notifyPlanModeStateChanged(
  conversationId: string,
  view: PlanModeView,
): void {
  const id = conversationId.trim()
  if (!id) return
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.PlanModeStateChanged(window.webContents, {
      conversationId: id,
      view,
    })
  }
}
