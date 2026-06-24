import { shouldInterceptSandboxPreviewNavigation } from '@shared/sandbox/preview-navigation'
import { webContentSend } from './web-content-send'

export function attachSandboxPreviewNavigation(
  webContents: Electron.WebContents,
  appShellUrl: string,
): void {
  const openPreview = (fileUrl: string) => {
    webContentSend.OpenSandboxPreview(webContents, { fileUrl })
  }

  webContents.on('will-navigate', (event, url) => {
    if (!shouldInterceptSandboxPreviewNavigation(url, appShellUrl)) return
    event.preventDefault()
    openPreview(url)
  })

  webContents.setWindowOpenHandler(({ url }) => {
    if (shouldInterceptSandboxPreviewNavigation(url, appShellUrl)) {
      openPreview(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
}
