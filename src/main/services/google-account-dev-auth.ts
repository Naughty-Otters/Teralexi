/**
 * Unpackaged checkout (`npm run dev`) platform sign-in helpers.
 *
 * Login page is `{BASE_API}/auth/login` from env merge:
 *   env/.dev.env → env/.env → env/.dev.local.env
 *
 * Preferred UX: open the system browser (full size) with
 * `redirect_uri=http://127.0.0.1:<port>/callback`. Local OpenFDEServer login.html
 * honors that redirect. Packaged apps still use teralexi:// via OS deep links.
 *
 * `openDevAuthLoginWindow` remains available as a fallback for hosts that still
 * hardcode teralexi:// (e.g. api.teralexi.com before deploy).
 */

import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { parse as parseUrl } from 'node:url'
import { BrowserWindow, app, shell, type WebContents } from 'electron'
import { createLogger } from '@main/logger'
import { parseTeralexiProtocolUrl } from '@shared/teralexi-protocol'

const log = createLogger('services.google-account-dev-auth')

export const DEV_AUTH_TOKEN_KEY = 'teralexi_access_token'
export const DEV_AUTH_REFRESH_TOKEN_KEY = 'teralexi_refresh_token'
export const DEV_AUTH_TOKEN_EXPIRES_IN_KEY = 'teralexi_token_expires_in'

const POLL_INTERVAL_MS = 400

/** Chrome-like UA so Google OAuth is less likely to block the embedded window. */
const DEV_AUTH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export type DevAuthCallbackParams = {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scope?: string
}

export function shouldUseDevAuthLoopback(): boolean {
  return !app.isPackaged
}

/** Open `{BASE_API}/auth/login?...` in the user's normal (full-size) browser. */
export async function openDevAuthLoginInBrowser(loginPageUrl: string): Promise<void> {
  log.info('Opening platform login in system browser', { loginPageUrl })
  await shell.openExternal(loginPageUrl)
}

export function parseDevAuthCallbackParams(
  rawUrl: string,
): DevAuthCallbackParams | null {
  try {
    const fromCustom = parseTeralexiProtocolUrl(rawUrl)
    if (fromCustom?.type === 'open') {
      return {
        accessToken: fromCustom.accessToken,
        refreshToken: fromCustom.refreshToken,
        expiresIn: fromCustom.expiresIn,
        scope: fromCustom.scope,
      }
    }

    const url = new URL(rawUrl)
    const accessToken =
      url.searchParams.get('access_token')?.trim() ||
      url.searchParams.get('token')?.trim() ||
      url.searchParams.get('id_token')?.trim()
    if (!accessToken) return null

    const refreshToken = url.searchParams.get('refresh_token')?.trim()
    const expiresRaw = url.searchParams.get('expires_in')?.trim()
    const expiresIn =
      expiresRaw && Number.isFinite(Number(expiresRaw))
        ? Number(expiresRaw)
        : undefined
    const scope = url.searchParams.get('scope')?.trim()
    return {
      accessToken,
      refreshToken: refreshToken || undefined,
      expiresIn,
      scope: scope || undefined,
    }
  } catch {
    return null
  }
}

/** JS run in the page world (preload + poll). Exported for unit tests. */
export function buildDevAuthBridgeSource(loopbackCallbackUrl: string): string {
  return `(() => {
    if (window.__teralexiDevAuthBridge) return;
    window.__teralexiDevAuthBridge = true;

    const LOOPBACK = ${JSON.stringify(loopbackCallbackUrl)};
    const TOKEN_KEY = ${JSON.stringify(DEV_AUTH_TOKEN_KEY)};
    const REFRESH_TOKEN_KEY = ${JSON.stringify(DEV_AUTH_REFRESH_TOKEN_KEY)};
    const TOKEN_EXPIRES_IN_KEY = ${JSON.stringify(DEV_AUTH_TOKEN_EXPIRES_IN_KEY)};

    function buildLoopbackUrl() {
      const accessToken = localStorage.getItem(TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!accessToken || !refreshToken) return null;
      const params = new URLSearchParams();
      params.set('access_token', accessToken);
      params.set('refresh_token', refreshToken);
      params.set(
        'expires_in',
        localStorage.getItem(TOKEN_EXPIRES_IN_KEY) || '86400',
      );
      return LOOPBACK + (LOOPBACK.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    }

    function goLoopback() {
      const url = buildLoopbackUrl();
      if (!url) return false;
      window.location.replace(url);
      return true;
    }

    function rewrite(url) {
      try {
        const raw = String(url);
        if (raw.indexOf('teralexi:') === 0) {
          const loop = buildLoopbackUrl();
          if (loop) return loop;
          // Block bare teralexi:// even when tokens are not ready yet.
          return 'about:blank';
        }
      } catch (_) {}
      return url;
    }

    try {
      const originalAssign = window.location.assign.bind(window.location);
      const originalReplace = window.location.replace.bind(window.location);
      window.location.assign = function (url) {
        return originalAssign(rewrite(url));
      };
      window.location.replace = function (url) {
        return originalReplace(rewrite(url));
      };
    } catch (_) {}

    try {
      const desc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
      if (desc && desc.set && desc.get) {
        Object.defineProperty(Location.prototype, 'href', {
          configurable: true,
          enumerable: desc.enumerable,
          get: function () {
            return desc.get.call(this);
          },
          set: function (v) {
            return desc.set.call(this, rewrite(v));
          },
        });
      }
    } catch (_) {}

    document.addEventListener(
      'click',
      function (event) {
        var t = event.target;
        if (!t || !t.closest) return;
        if (!t.closest('#open-app-button')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        goLoopback();
      },
      true,
    );

    window.__teralexiReadDevAuthTokens = function () {
      var accessToken = localStorage.getItem(TOKEN_KEY);
      var refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!accessToken || !refreshToken) return null;
      var expiresRaw = localStorage.getItem(TOKEN_EXPIRES_IN_KEY);
      var expiresIn =
        expiresRaw && isFinite(Number(expiresRaw))
          ? Number(expiresRaw)
          : undefined;
      return {
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresIn: expiresIn,
      };
    };
  })();`
}

function writeDevAuthPreload(loopbackCallbackUrl: string): string {
  const preloadPath = join(
    tmpdir(),
    `teralexi-dev-auth-preload-${process.pid}-${Date.now()}.cjs`,
  )
  // Preload runs before page scripts when contextIsolation is false.
  writeFileSync(
    preloadPath,
    `${buildDevAuthBridgeSource(loopbackCallbackUrl)}\n`,
    'utf8',
  )
  return preloadPath
}

export type DevAuthLoopbackSession = {
  callbackUrl: string
  promise: Promise<DevAuthCallbackParams>
  close: () => void
  /** Deliver tokens without an HTTP round-trip (localStorage poll path). */
  deliver: (params: DevAuthCallbackParams) => void
}

export async function startDevAuthLoopback(): Promise<DevAuthLoopbackSession> {
  let server: Server | undefined
  let settled = false
  let resolveCb: ((value: DevAuthCallbackParams) => void) | undefined
  let rejectCb: ((error: Error) => void) | undefined

  const promise = new Promise<DevAuthCallbackParams>((resolve, reject) => {
    resolveCb = resolve
    rejectCb = reject
  })

  const settle = (
    action: 'resolve' | 'reject',
    value: DevAuthCallbackParams | Error,
  ) => {
    if (settled) return
    settled = true
    if (server) {
      server.close()
      server = undefined
    }
    if (action === 'resolve') resolveCb!(value as DevAuthCallbackParams)
    else rejectCb!(value as Error)
  }

  server = createServer((req, res) => {
    const reqUrl = parseUrl(req.url ?? '', true)
    if (reqUrl.pathname !== '/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }

    const raw = `http://127.0.0.1${req.url ?? ''}`
    const params = parseDevAuthCallbackParams(raw)
    const html = (msg: string) =>
      `<!doctype html><html><body style="font-family:system-ui;padding:32px"><h2>${msg}</h2><p>You can close this window and return to Teralexi.</p></body></html>`

    if (!params) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html('Invalid sign-in callback.'))
      settle('reject', new Error('Invalid sign-in callback (missing tokens).'))
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html('Signed in successfully.'))
    settle('resolve', params)
  })

  server.on('error', (err) => {
    settle('reject', err instanceof Error ? err : new Error(String(err)))
  })

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    settle('reject', new Error('Failed to bind local sign-in callback server.'))
    return {
      callbackUrl: '',
      promise,
      close: () => settle('reject', new Error('Sign-in cancelled.')),
      deliver: (params) => settle('resolve', params),
    }
  }

  const callbackUrl = `http://127.0.0.1:${address.port}/callback`
  log.info('Dev auth loopback listening', { callbackUrl })

  return {
    callbackUrl,
    promise,
    close: () => settle('reject', new Error('Sign-in cancelled.')),
    deliver: (params) => settle('resolve', params),
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function attachTokenPoll(
  webContents: WebContents,
  opts: {
    loginPageUrl: string
    onTokens: (params: DevAuthCallbackParams) => void
  },
): () => void {
  let stopped = false
  let delivered = false

  const tick = async () => {
    if (stopped || delivered || webContents.isDestroyed()) return
    const current = webContents.getURL()
    const loginOrigin = originOf(opts.loginPageUrl)
    const currentOrigin = originOf(current)
    // Only read storage on the login origin (BASE_API), never on Google/Apple.
    if (
      !currentOrigin ||
      !loginOrigin ||
      currentOrigin !== loginOrigin
    ) {
      return
    }
    try {
      const tokens = (await webContents.executeJavaScript(
        `window.__teralexiReadDevAuthTokens ? window.__teralexiReadDevAuthTokens() : null`,
        true,
      )) as DevAuthCallbackParams | null
      if (!tokens?.accessToken || !tokens.refreshToken) return
      delivered = true
      log.info('Captured platform tokens from login page localStorage')
      opts.onTokens(tokens)
    } catch (err) {
      log.warn('Dev auth token poll failed', { err })
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, POLL_INTERVAL_MS)
  void tick()

  return () => {
    stopped = true
    clearInterval(timer)
  }
}

function attachDevAuthNavigationGuards(
  win: BrowserWindow,
  opts: {
    loopbackCallbackUrl: string
    onTeralexiUrl?: (url: string) => void
  },
): void {
  const blockTeralexi = (url: string): boolean => {
    if (!url.startsWith('teralexi:')) return false
    log.info('Blocked teralexi:// navigation in dev auth window', {
      url: url.slice(0, 120),
    })
    opts.onTeralexiUrl?.(url)
    return true
  }

  win.webContents.on('will-navigate', (event, url) => {
    if (blockTeralexi(url)) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event, url) => {
    if (blockTeralexi(url)) event.preventDefault()
  })
  win.webContents.on('will-frame-navigate', (details) => {
    if (blockTeralexi(details.url)) details.preventDefault()
  })
  win.webContents.on(
    'did-fail-load',
    (_event, _code, _desc, validatedURL) => {
      if (validatedURL) blockTeralexi(validatedURL)
    },
  )
}

/**
 * Opens `{BASE_API}/auth/login` (from env/.dev.env + env/.env) in-app.
 * Completes via localStorage poll — works even when login.html ignores redirect_uri.
 *
 * Uses an ephemeral session partition so stale localhost tokens from a previous
 * sign-in cannot auto-complete and close the window before the user sees /auth/login.
 */
export async function openDevAuthLoginWindow(opts: {
  loginPageUrl: string
  loopbackCallbackUrl: string
  onTokens: (params: DevAuthCallbackParams) => void
  onTeralexiUrl?: (url: string) => void
}): Promise<{ window: BrowserWindow; stop: () => void }> {
  const preloadPath = writeDevAuthPreload(opts.loopbackCallbackUrl)
  const stoppers: Array<() => void> = []
  // temp: = in-memory partition, discarded when auth windows close.
  const partition = `temp:teralexi-dev-auth-${Date.now()}`

  const authWebPreferences = {
    preload: preloadPath,
    partition,
    // Intentional: preload must patch Location before page JS (old login.html
    // hardcodes teralexi://). Auth window only; no nodeIntegration.
    contextIsolation: false,
    nodeIntegration: false,
    sandbox: false,
  }

  const win = new BrowserWindow({
    width: 520,
    height: 740,
    title: 'Sign in to Teralexi',
    autoHideMenuBar: true,
    show: false,
    webPreferences: authWebPreferences,
  })

  win.webContents.setUserAgent(DEV_AUTH_USER_AGENT)
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })

  const reinject = async () => {
    if (win.isDestroyed()) return
    const current = win.webContents.getURL()
    const loginOrigin = originOf(opts.loginPageUrl)
    const currentOrigin = originOf(current)
    if (!currentOrigin || currentOrigin !== loginOrigin) return
    try {
      await win.webContents.executeJavaScript(
        buildDevAuthBridgeSource(opts.loopbackCallbackUrl),
        true,
      )
    } catch (err) {
      log.warn('Failed to reinject dev auth bridge', { err })
    }
  }

  win.webContents.on('dom-ready', () => {
    void reinject()
  })
  win.webContents.on('did-finish-load', () => {
    void reinject()
  })

  attachDevAuthNavigationGuards(win, opts)

  // Start polling only after the login page has loaded once, so we never
  // treat a blank/about:blank frame as a completed sign-in.
  let pollStarted = false
  const startPoll = () => {
    if (pollStarted || win.isDestroyed()) return
    pollStarted = true
    stoppers.push(
      attachTokenPoll(win.webContents, {
        loginPageUrl: opts.loginPageUrl,
        onTokens: opts.onTokens,
      }),
    )
  }
  win.webContents.once('did-finish-load', () => startPoll())

  // Google / Apple may open a popup. Keep it in-process with the same session.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('teralexi:')) {
      opts.onTeralexiUrl?.(url)
      return { action: 'deny' }
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: { ...authWebPreferences },
      },
    }
  })

  win.webContents.on('did-create-window', (child) => {
    child.webContents.setUserAgent(DEV_AUTH_USER_AGENT)
    attachDevAuthNavigationGuards(child, opts)
    stoppers.push(
      attachTokenPoll(child.webContents, {
        loginPageUrl: opts.loginPageUrl,
        onTokens: opts.onTokens,
      }),
    )
    child.webContents.on('dom-ready', () => {
      void child.webContents
        .executeJavaScript(
          buildDevAuthBridgeSource(opts.loopbackCallbackUrl),
          true,
        )
        .catch(() => {})
    })
  })

  log.info('Opening platform login in-app window', {
    loginPageUrl: opts.loginPageUrl,
    loginOrigin: originOf(opts.loginPageUrl),
    loopbackCallbackUrl: opts.loopbackCallbackUrl,
    partition,
  })
  await win.loadURL(opts.loginPageUrl)

  return {
    window: win,
    stop: () => {
      for (const stop of stoppers.splice(0)) stop()
    },
  }
}
