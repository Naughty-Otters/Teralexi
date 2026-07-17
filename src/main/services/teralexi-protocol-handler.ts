import { app, BrowserWindow } from 'electron'
import { createLogger } from '@main/logger'
import {
  TERALEXI_PROTOCOL,
  parseTeralexiProtocolUrl,
} from '@shared/teralexi-protocol'
import { handleGoogleAccountOAuthDeepLink } from '@main/services/google-account-oauth'
import { syncStoredGoogleAccountToRenderers } from '@main/services/google-account-notify'
import { revokeLocalTeralexiAuthSession } from '@main/services/local-auth-session'
import { getTeralexiProtocolBridge } from '@main/services/teralexi-protocol-bridge'
import { getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import {
  acceptPresentedServerAccessToken,
  isLikelyPresentedServerAccessToken,
} from '@main/services/teralexi-server-auth'

const log = createLogger('services.teralexi-protocol')

function focusMainWindow(): void {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  // Splash uses always-on-top during startup; prefer the main app window.
  const main =
    windows.find((w) => !w.isAlwaysOnTop()) ??
    windows[windows.length - 1]
  if (!main) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
}

function extractProtocolUrlFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${TERALEXI_PROTOCOL}://`))
}

export async function dispatchTeralexiUrl(rawUrl: string): Promise<void> {
  const action = parseTeralexiProtocolUrl(rawUrl)
  if (!action) {
    log.warn('Ignoring unrecognized teralexi URL', { rawUrl })
    return
  }

  log.info('Handling teralexi protocol URL', { host: action.type })

  if (action.type === 'logout') {
    revokeLocalTeralexiAuthSession('Signed out from Teralexi web authentication', {
      cause: 'web-logout',
    })
    syncStoredGoogleAccountToRenderers()
    focusMainWindow()
    return
  }

  if (action.type === 'open') {
    try {
      // Persist account + exchange server JWT before focusing the main window.
      // Focusing first used to race main-active session checks that revoked the
      // brand-new login (UI stayed locked).
      await handleGoogleAccountOAuthDeepLink({
        accessToken: action.accessToken,
        refreshToken: action.refreshToken,
        expiresIn: action.expiresIn,
        scope: action.scope,
      })
      // If the website sent a platform JWT (not Google id_token), cache it so
      // main-active can authorize without waiting on a Google exchange.
      if (isLikelyPresentedServerAccessToken(action.accessToken)) {
        const apiBaseUrl = getTeralexiBaseApiUrl()
        if (apiBaseUrl) {
          acceptPresentedServerAccessToken({
            accessToken: action.accessToken,
            apiBaseUrl,
            expiresInSeconds: action.expiresIn,
          })
        }
      }
      // Do not clearTeralexiServerAuthCache here — that wiped the JWT just
      // exchanged during onGoogleAccountSignedIn.
      syncStoredGoogleAccountToRenderers()
    } catch (err) {
      log.error('Google OAuth deep link failed', { err })
    }
    focusMainWindow()
  }
}

export function handleTeralexiProtocolUrl(rawUrl: string): void {
  const bridge = getTeralexiProtocolBridge()
  log.info('Received teralexi protocol URL', {
    ready: bridge.ready,
    hasDispatch: Boolean(bridge.dispatchUrl),
    queued: bridge.pendingUrls.length,
    url: rawUrl.slice(0, 120),
  })

  if (!bridge.ready || !bridge.dispatchUrl) {
    bridge.pendingUrls.push(rawUrl)
    return
  }

  void bridge.dispatchUrl(rawUrl)
}

/**
 * Called from main-app.js when the renderer can receive account updates.
 * Pass the dispatch fn from the same bundle as google-account-oauth IPC handlers.
 */
export function setTeralexiProtocolHandlerReady(
  dispatchUrl: (rawUrl: string) => Promise<void> = dispatchTeralexiUrl,
): void {
  const bridge = getTeralexiProtocolBridge()
  if (bridge.ready) return

  bridge.dispatchUrl = dispatchUrl
  bridge.ready = true
  const queued = bridge.pendingUrls.splice(0)

  log.info('Teralexi protocol handler ready', { queuedCount: queued.length })

  void (async () => {
    for (const url of queued) {
      await dispatchUrl(url)
    }
    syncStoredGoogleAccountToRenderers()
  })()
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
    if (url) {
      // dispatchTeralexiUrl focuses after the account is applied so main-active
      // session checks cannot revoke a brand-new login.
      handleTeralexiProtocolUrl(url)
      return
    }
    focusMainWindow()
  })

  const startupUrl = extractProtocolUrlFromArgv(process.argv)
  if (startupUrl) {
    handleTeralexiProtocolUrl(startupUrl)
  }
}

export function requestTeralexiSingleInstanceLock(): boolean {
  return app.requestSingleInstanceLock()
}
