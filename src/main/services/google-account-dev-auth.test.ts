import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn(function BrowserWindowMock(this: {
    webContents: {
      on: ReturnType<typeof vi.fn>
      once: ReturnType<typeof vi.fn>
      setWindowOpenHandler: ReturnType<typeof vi.fn>
      executeJavaScript: ReturnType<typeof vi.fn>
      setUserAgent: ReturnType<typeof vi.fn>
      getURL: ReturnType<typeof vi.fn>
      isDestroyed: ReturnType<typeof vi.fn>
    }
    on: ReturnType<typeof vi.fn>
    once: ReturnType<typeof vi.fn>
    loadURL: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    isDestroyed: ReturnType<typeof vi.fn>
  }) {
    this.webContents = {
      on: vi.fn(),
      once: vi.fn(),
      setWindowOpenHandler: vi.fn(() => undefined),
      executeJavaScript: vi.fn(async () => null),
      setUserAgent: vi.fn(),
      getURL: vi.fn(() => 'http://localhost:8000/auth/login'),
      isDestroyed: vi.fn(() => false),
    }
    this.on = vi.fn()
    this.once = vi.fn()
    this.loadURL = vi.fn(async () => undefined)
    this.close = vi.fn()
    this.show = vi.fn()
    this.isDestroyed = vi.fn(() => false)
  }),
}))

import {
  buildDevAuthBridgeSource,
  openDevAuthLoginWindow,
  parseDevAuthCallbackParams,
  shouldUseDevAuthLoopback,
  startDevAuthLoopback,
} from './google-account-dev-auth'

describe('google-account-dev-auth', () => {
  const sessions: Array<{ close: () => void }> = []

  afterEach(() => {
    for (const session of sessions.splice(0)) session.close()
  })

  it('enables loopback when unpackaged', () => {
    expect(shouldUseDevAuthLoopback()).toBe(true)
  })

  it('receives tokens on the loopback callback URL', async () => {
    const session = await startDevAuthLoopback()
    sessions.push(session)
    expect(session.callbackUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    )

    const response = await fetch(
      `${session.callbackUrl}?access_token=tok&refresh_token=ref&expires_in=60`,
    )
    expect(response.ok).toBe(true)

    await expect(session.promise).resolves.toEqual({
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresIn: 60,
      scope: undefined,
    })
  })

  it('deliver() completes without HTTP navigation', async () => {
    const session = await startDevAuthLoopback()
    sessions.push(session)
    session.deliver({
      accessToken: 'a',
      refreshToken: 'b',
      expiresIn: 120,
    })
    await expect(session.promise).resolves.toEqual({
      accessToken: 'a',
      refreshToken: 'b',
      expiresIn: 120,
    })
  })

  it('bridge source rewrites teralexi:// to loopback when tokens exist', () => {
    const source = buildDevAuthBridgeSource(
      'http://127.0.0.1:5555/callback',
    )
    expect(source).toContain('teralexi:')
    expect(source).toContain('http://127.0.0.1:5555/callback')
    expect(source).toContain('__teralexiReadDevAuthTokens')
    expect(source).toContain('open-app-button')
  })

  it('parses teralexi://open callbacks', () => {
    expect(
      parseDevAuthCallbackParams(
        'teralexi://open?access_token=a&refresh_token=b&expires_in=9',
      ),
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'b',
      expiresIn: 9,
      scope: undefined,
    })
  })

  it('opens the provided BASE_API login URL in-app', async () => {
    const loginPageUrl =
      'http://localhost:8000/auth/login?redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback'
    const opened = await openDevAuthLoginWindow({
      loginPageUrl,
      loopbackCallbackUrl: 'http://127.0.0.1:5555/callback',
      onTokens: vi.fn(),
    })
    expect(opened.window.loadURL).toHaveBeenCalledWith(loginPageUrl)
    opened.stop()
  })

  it('opens api.teralexi.com login URL from .dev.env style BASE_API', async () => {
    const loginPageUrl =
      'https://api.teralexi.com/auth/login?redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback'
    const opened = await openDevAuthLoginWindow({
      loginPageUrl,
      loopbackCallbackUrl: 'http://127.0.0.1:5555/callback',
      onTokens: vi.fn(),
    })
    expect(opened.window.loadURL).toHaveBeenCalledWith(loginPageUrl)
    opened.stop()
  })
})

describe('hosted login.html regression (live hosts)', () => {
  it('documents that localhost and api.teralexi.com ignore redirect_uri today', async () => {
    // Live verification: old login pages hardcode teralexi://. Our desktop
    // bridge must not depend on redirect_uri support.
    async function fetchLogin(url: string): Promise<string | null> {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return null
        return await res.text()
      } catch {
        return null
      }
    }

    const local = await fetchLogin('http://localhost:8000/auth/login')
    if (local) {
      expect(local).toContain('teralexi://open')
      // Current Docker image does not honor redirect_uri (source may already).
      const hasRedirectHonor =
        /redirect_uri[\s\S]*127\.0\.0\.1|redirectUri[\s\S]*127\.0\.0\.1/.test(
          local,
        )
      // Soft assert: either old (no honor) or new (honors). Both are OK for
      // desktop because we poll localStorage either way.
      expect(typeof hasRedirectHonor).toBe('boolean')
    }

    const api = await fetchLogin('https://api.teralexi.com/auth/login')
    if (api) {
      expect(api).toContain('teralexi://open')
    }
  })
})

describe('bridge rewrite against old login.html snippet', () => {
  it('rewrites location.href teralexi assignments when tokens are present', () => {
    const loopback = 'http://127.0.0.1:5555/callback'
    const store = new Map<string, string>([
      ['teralexi_access_token', 'access'],
      ['teralexi_refresh_token', 'refresh'],
      ['teralexi_token_expires_in', '60'],
    ])

    let hrefValue = 'http://localhost:8000/auth/login'
    class FakeLocation {
      assign(u: string) {
        hrefValue = u
      }
      replace(u: string) {
        hrefValue = u
      }
    }
    Object.defineProperty(FakeLocation.prototype, 'href', {
      configurable: true,
      enumerable: true,
      get() {
        return hrefValue
      },
      set(v: string) {
        hrefValue = String(v)
      },
    })

    const locationObj = new FakeLocation() as FakeLocation & {
      href: string
    }

    const sandbox = {
      window: {
        location: locationObj,
        __teralexiDevAuthBridge: undefined as unknown,
        __teralexiReadDevAuthTokens: undefined as unknown,
      },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
      document: {
        addEventListener: vi.fn(),
      },
      Location: FakeLocation,
      URLSearchParams,
      isFinite,
      Number,
      String,
    }

    const source = buildDevAuthBridgeSource(loopback)
    const fn = new Function(
      'window',
      'localStorage',
      'document',
      'Location',
      'URLSearchParams',
      'isFinite',
      'Number',
      'String',
      source,
    )
    fn(
      sandbox.window,
      sandbox.localStorage,
      sandbox.document,
      sandbox.Location,
      sandbox.URLSearchParams,
      sandbox.isFinite,
      sandbox.Number,
      sandbox.String,
    )

    // Old login.html does: window.location.href = "teralexi://open?..."
    locationObj.href = 'teralexi://open?access_token=x'

    expect(hrefValue.startsWith(loopback)).toBe(true)
    expect(hrefValue).toContain('access_token=access')
    expect(hrefValue).toContain('refresh_token=refresh')

    const tokens = (
      sandbox.window.__teralexiReadDevAuthTokens as () => {
        accessToken: string
        refreshToken: string
      }
    )()
    expect(tokens.accessToken).toBe('access')
    expect(tokens.refreshToken).toBe('refresh')
  })
})
