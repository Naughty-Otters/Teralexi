import { BrowserWindow } from 'electron'
import type { EntitlementUiSnapshot } from '@shared/subscription/entitlement-types'
import { webContentSend } from '@main/services/web-content-send'

export function notifyEntitlementChanged(
  entitlement: EntitlementUiSnapshot | null,
  webContents?: Electron.WebContents,
): void {
  const payload = { entitlement }
  if (webContents) {
    webContentSend.EntitlementChanged(webContents, payload)
    return
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.EntitlementChanged(window.webContents, payload)
  }
}
