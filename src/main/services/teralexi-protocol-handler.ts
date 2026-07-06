import { app, BrowserWindow } from 'electron'
import { createLogger } from '@main/logger'
import {
  TERALEXI_PROTOCOL,
  parseTeralexiProtocolUrl,
} from '@shared/teralexi-protocol'
import { handleGoogleAccountOAuthDeepLink } from '@main/services/google-account-oauth'
import { clearTeralexiServerAuthCache } from '@main/services/teralexi-server-auth'

const log = createLogger('services.teralexi-protocol')

const pendingProtocolUrls: string[] = []
let protocolHandlerReady = false

function focusMainWindow(): void {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  const main = windows[0]
  if (!main) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
}

function extractProtocolUrlFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${TERALEXI_PROTOCOL}://`))
}

async function dispatchTeralexiUrl(rawUrl: string): Promise<void> {
  const action = parseTeralexiProtocolUrl(rawUrl)
  if (!action) {
    log.warn('Ignoring unrecognized teralexi URL', { rawUrl })
    return
  }

  log.info('Handling teralexi protocol URL', { host: action.type })
  focusMainWindow()

  if (action.type === 'open') {
    try {
      await handleGoogleAccountOAuthDeepLink({
        accessToken: action.accessToken,
        refreshToken: action.refreshToken,
        expiresIn: action.expiresIn,
        scope: action.scope,
      })
      clearTeralexiServerAuthCache()
    } catch (err) {
      log.error('Google OAuth deep link failed', { err })
    }
  }
}

export function handleTeralexiProtocolUrl(rawUrl: string): void {
  if (!protocolHandlerReady) {
    pendingProtocolUrls.push(rawUrl)
    return
  }
  void dispatchTeralexiUrl(rawUrl)
}

export function setTeralexiProtocolHandlerReady(): void {
  protocolHandlerReady = true
  for (const url of pendingProtocolUrls.splice(0)) {
    void dispatchTeralexiUrl(url)
  }
}

export function registerTeralexiProtocolClient(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(
        TERALEXI_PROTOCOL,
        process.execPath,
        [process.argv[1]!],
      )
    }
  } else {
    app.setAsDefaultProtocolClient(TERALEXI_PROTOCOL)
  }
}

export function registerTeralexiProtocolHandlers(): void {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleTeralexiProtocolUrl(url)
  })

  app.on('second-instance', (_event, argv) => {
    const url = extractProtocolUrlFromArgv(argv)
    if (url) handleTeralexiProtocolUrl(url)
  })

  const startupUrl = extractProtocolUrlFromArgv(process.argv)
  if (startupUrl) {
    handleTeralexiProtocolUrl(startupUrl)
  }
}

export function requestTeralexiSingleInstanceLock(): boolean {
  return app.requestSingleInstanceLock()
}
