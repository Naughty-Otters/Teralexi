import { BrowserWindow } from 'electron'
import { webContentSend } from '@main/services/web-content-send'
import type { GoogleWorkspaceAccountUiInfo } from '@main/services/google-workspace-oauth'

export function notifyGoogleWorkspaceAccountChanged(
  account: GoogleWorkspaceAccountUiInfo | null,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    webContentSend.GoogleWorkspaceAccountChanged(window.webContents, { account })
  }
}
