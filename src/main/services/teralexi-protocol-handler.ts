import { app, BrowserWindow, protocol } from 'electron'
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

function closeDevAuthLoginWindows(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (win.getTitle() === 'Sign in to Teralexi') {
      win.close()
    }
  }
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
            refreshToken: action.refreshToken,
          })
        }
      }
      // Do not clearTeralexiServerAuthCache here — that wiped the JWT just
      // exchanged during onGoogleAccountSignedIn.
      syncStoredGoogleAccountToRenderers()
    } catch (err) {
      log.error('Google OAuth deep link failed', { err })
      // Push current stored account (likely null) so the UI does not keep a
      // stale signed-in state after a failed deep-link exchange.
      syncStoredGoogleAccountToRenderers()
    }
    closeDevAuthLoginWindows()
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

/**
 * Must run before `app.whenReady()` so BrowserWindow can navigate to teralexi://
 * in unpackaged/dev without handing the URL to the OS.
 */
export function registerTeralexiProtocolScheme(): void {
  if (app.isPackaged) return
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TERALEXI_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ])
  log.info('Registered privileged teralexi:// scheme for unpackaged/dev login')
}

/**
 * After `app.whenReady()`: handle teralexi:// inside this process (dev only).
 * Prevents macOS from launching a blank Electron.app shell.
 */
export function registerInternalTeralexiProtocolHandler(): void {
  if (app.isPackaged) return
  try {
    protocol.handle(TERALEXI_PROTOCOL, (request) => {
      handleTeralexiProtocolUrl(request.url)
      closeDevAuthLoginWindows()
      return new Response(
        '<!doctype html><html><body style="font-family:system-ui;padding:24px">Signed in. You can close this window and return to Teralexi.</body></html>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    })
    log.info('Registered in-process teralexi:// handler for unpackaged/dev login')
  } catch (err) {
    log.warn('Failed to register in-process teralexi:// handler', { err })
  }
}

export function registerTeralexiProtocolClient(): void {
  // Packaged builds: register the app bundle for OS-level teralexi:// deep links.
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(TERALEXI_PROTOCOL)
    return
  }

  // Unpackaged (npm run dev): never register bare Electron.app as the OS handler.
  // That produces the blank window with "Electron path-to-app".
  //
  // Important: older builds registered with
  //   setAsDefaultProtocolClient(scheme, process.execPath, [process.argv[1]])
  // removeAsDefaultProtocolClient(scheme) alone does NOT clear that binding
  // (returns false). Clear every known registration shape.
  const entry = process.argv[1]
  const cleared = {
    plain: app.removeAsDefaultProtocolClient(TERALEXI_PROTOCOL),
    withExecPath: app.removeAsDefaultProtocolClient(
      TERALEXI_PROTOCOL,
      process.execPath,
    ),
    withExecPathAndEntry: entry
      ? app.removeAsDefaultProtocolClient(TERALEXI_PROTOCOL, process.execPath, [
          entry,
        ])
      : false,
  }
  log.info('Cleared OS teralexi:// binding for unpackaged/dev', {
    cleared,
    execPath: process.execPath,
    entry,
    defaultApp: Boolean(process.defaultApp),
  })
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
