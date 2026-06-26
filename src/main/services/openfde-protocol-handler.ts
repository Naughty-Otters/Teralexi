import { app, BrowserWindow } from 'electron'
import { createLogger } from '@main/logger'
import {
  OPENFDE_PROTOCOL,
  parseOpenFdeProtocolUrl,
} from '@shared/openfde-protocol'
import { handleGoogleAccountOAuthDeepLink } from '@main/services/google-account-oauth'
import { clearOpenFdeServerAuthCache } from '@main/services/openfde-server-auth'

const log = createLogger('services.openfde-protocol')

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
  return argv.find((arg) => arg.startsWith(`${OPENFDE_PROTOCOL}://`))
}

async function dispatchOpenFdeUrl(rawUrl: string): Promise<void> {
  const action = parseOpenFdeProtocolUrl(rawUrl)
  if (!action) {
    log.warn('Ignoring unrecognized openfde URL', { rawUrl })
    return
  }

  log.info('Handling openfde protocol URL', { host: action.type })
  focusMainWindow()

  if (action.type === 'open') {
    try {
      await handleGoogleAccountOAuthDeepLink({
        accessToken: action.accessToken,
        refreshToken: action.refreshToken,
        expiresIn: action.expiresIn,
        scope: action.scope,
      })
      clearOpenFdeServerAuthCache()
    } catch (err) {
      log.error('Google OAuth deep link failed', { err })
    }
  }
}

export function handleOpenFdeProtocolUrl(rawUrl: string): void {
  if (!protocolHandlerReady) {
    pendingProtocolUrls.push(rawUrl)
    return
  }
  void dispatchOpenFdeUrl(rawUrl)
}

export function setOpenFdeProtocolHandlerReady(): void {
  protocolHandlerReady = true
  for (const url of pendingProtocolUrls.splice(0)) {
    void dispatchOpenFdeUrl(url)
  }
}

export function registerOpenFdeProtocolClient(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(
        OPENFDE_PROTOCOL,
        process.execPath,
        [process.argv[1]!],
      )
    }
  } else {
    app.setAsDefaultProtocolClient(OPENFDE_PROTOCOL)
  }
}

export function registerOpenFdeProtocolHandlers(): void {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleOpenFdeProtocolUrl(url)
  })

  app.on('second-instance', (_event, argv) => {
    const url = extractProtocolUrlFromArgv(argv)
    if (url) handleOpenFdeProtocolUrl(url)
  })

  const startupUrl = extractProtocolUrlFromArgv(process.argv)
  if (startupUrl) {
    handleOpenFdeProtocolUrl(startupUrl)
  }
}

export function requestOpenFdeSingleInstanceLock(): boolean {
  return app.requestSingleInstanceLock()
}
