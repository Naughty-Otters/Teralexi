import { BrowserWindow } from 'electron'
import { webContentSend } from '@main/services/web-content-send'
import type { GoogleAccountUiInfo } from '@main/services/google-account-oauth'

export function notifyGoogleAccountChanged(
  account: GoogleAccountUiInfo | null,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.GoogleAccountChanged(window.webContents, { account })
  }
}
