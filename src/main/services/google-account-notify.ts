import { BrowserWindow } from 'electron'
import { webContentSend } from '@main/services/web-content-send'
import {
  googleAccountInfoForUi,
  loadStoredAccount,
  type GoogleAccountUiInfo,
} from '@main/services/google-account-oauth'

export function notifyGoogleAccountChanged(
  account: GoogleAccountUiInfo | null,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.GoogleAccountChanged(window.webContents, { account })
  }
}

/** Re-read persisted account and push to all renderer windows (e.g. after OAuth deep link). */
export function syncStoredGoogleAccountToRenderers(): void {
  const stored = loadStoredAccount()
  notifyGoogleAccountChanged(stored ? googleAccountInfoForUi(stored) : null)
}
