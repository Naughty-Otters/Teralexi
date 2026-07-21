import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

const electronMock = vi.hoisted(() => ({
  shell: { openExternal: vi.fn(async () => undefined) },
  app: { isPackaged: false },
  BrowserWindow: vi.fn(function BrowserWindowMock(this: {
    webContents: {
      on: ReturnType<typeof vi.fn>
      setWindowOpenHandler: ReturnType<typeof vi.fn>
    }
    on: ReturnType<typeof vi.fn>
    loadURL: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    isDestroyed: ReturnType<typeof vi.fn>
  }) {
    this.webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn() }
    this.on = vi.fn()
    this.loadURL = vi.fn(async () => undefined)
    this.close = vi.fn()
    this.isDestroyed = vi.fn(() => false)
  }),
}))

vi.mock('electron', () => electronMock)

vi.mock('node:https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn((_key: string, fallback = '') => fallback),
}))

vi.mock('@config/teralexi-home', () => ({
  getTeralexiAccountsDir: vi.fn(() => '/accounts'),
}))

vi.mock('@main/services/google-account-notify', () => ({
  notifyGoogleAccountChanged: vi.fn(),
}))

vi.mock('@main/services/entitlement-session', () => ({
  onGoogleAccountSignedIn: vi.fn(async () => null),
}))

vi.mock('@config/env-overrides', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/env-overrides')>()
  return {
    ...actual,
    isPackagedRuntime: vi.fn(() => false),
  }
})

vi.mock('@main/services/teralexi-platform-config', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./teralexi-platform-config')>()
  return {
    ...actual,
    getTeralexiBaseApiUrl: vi.fn(() => 'http://127.0.0.1:8000'),
  }
})

const devAuthMock = vi.hoisted(() => ({
  shouldUseDevAuthLoopback: vi.fn(() => false),
  startDevAuthLoopback: vi.fn(),
  openDevAuthLoginInBrowser: vi.fn(async () => undefined),
}))

vi.mock('@main/services/google-account-dev-auth', () => devAuthMock)
import { isPackagedRuntime } from '@config/env-overrides'
import {
  applyGoogleAccountOAuthCallback,
  clearStoredAccount,
  googleAccountSignInIsConfigured,
  handleGoogleAccountOAuthDeepLink,
  loadStoredAccount,
  resolveTeralexiGoogleAuthLoginUrl,
  startGoogleAccountSignIn,
} from './google-account-oauth'
import { GOOGLE_ACCOUNT_NOT_CONFIGURED } from '@shared/google-account-settings'
import { getSystemPropValue } from '@config/system-prop'

function makeTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fake-signature`
}

describe('google-account-oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSystemPropValue).mockImplementation(
      (_key: string, fallback = '') => fallback,
    )
  })

  it('resolveTeralexiGoogleAuthLoginUrl uses BASE_API when env unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(resolveTeralexiGoogleAuthLoginUrl()).toBe(
      'http://127.0.0.1:8000/auth/login',
    )
    vi.unstubAllEnvs()
  })

  it('resolveTeralexiGoogleAuthLoginUrl follows checkout BASE_API from .dev.env style host', async () => {
    const { getTeralexiBaseApiUrl } = await import(
      '@main/services/teralexi-platform-config'
    )
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('https://api.teralexi.com')
    expect(resolveTeralexiGoogleAuthLoginUrl()).toBe(
      'https://api.teralexi.com/auth/login',
    )
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('http://127.0.0.1:8000')
  })

  it('resolveTeralexiGoogleAuthLoginUrl follows checkout BASE_API from .env style localhost', async () => {
    const { getTeralexiBaseApiUrl } = await import(
      '@main/services/teralexi-platform-config'
    )
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('http://localhost:8000')
    expect(resolveTeralexiGoogleAuthLoginUrl()).toBe(
      'http://localhost:8000/auth/login',
    )
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('http://127.0.0.1:8000')
  })

  it('resolveTeralexiGoogleAuthLoginUrl prefers env override', () => {
    vi.mocked(getSystemPropValue).mockReturnValue('https://auth.example/login')
    expect(resolveTeralexiGoogleAuthLoginUrl()).toBe('https://auth.example/login')
  })

  it('googleAccountSignInIsConfigured is true with default URL', () => {
    expect(googleAccountSignInIsConfigured()).toBe(true)
  })

  it('resolveTeralexiGoogleAuthLoginUrl returns empty in packaged app without config', () => {
    vi.mocked(isPackagedRuntime).mockReturnValue(true)
    expect(resolveTeralexiGoogleAuthLoginUrl()).toBe('')
    vi.mocked(isPackagedRuntime).mockReturnValue(false)
  })

  it('applyGoogleAccountOAuthCallback accepts Google ID token', async () => {
    const idToken = makeTestJwt({
      sub: 'google-sub',
      email: 'user@gmail.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.png',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const account = await applyGoogleAccountOAuthCallback({
      accessToken: idToken,
      expiresIn: 3600,
      scope: 'openid email profile',
    })

    expect(account.userInfo.email).toBe('user@gmail.com')
    expect(account.userInfo.picture).toBe('https://example.com/avatar.png')
    expect(account.tokens.id_token).toBe(idToken)
    expect(account.tokens.access_token).toBe('')
  })

  it('loads avatar_url from /auth/me for platform access tokens without picture', async () => {
    const platformJwt = makeTestJwt({
      sub: '42',
      email: 'user@gmail.com',
      name: 'Test User',
      iss: 'http://127.0.0.1:8000',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: 42,
          sub_id: 'google-sub',
          email: 'user@gmail.com',
          full_name: 'Test User',
          avatar_url: 'https://lh3.googleusercontent.com/a/avatar',
        }),
      })),
    )

    const account = await applyGoogleAccountOAuthCallback({
      accessToken: platformJwt,
      refreshToken: 'refresh-1',
      expiresIn: 3600,
    })

    expect(account.userInfo.picture).toBe(
      'https://lh3.googleusercontent.com/a/avatar',
    )
    expect(account.tokens.access_token).toBe(platformJwt)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${platformJwt}`,
        }),
      }),
    )
  })

  it('loadStoredAccount returns null when no file', () => {
    expect(loadStoredAccount()).toBeNull()
  })

  it('clearStoredAccount is safe when missing', () => {
    expect(() => clearStoredAccount()).not.toThrow()
  })

  it('startGoogleAccountSignIn uses system browser + loopback when unpackaged', async () => {
    devAuthMock.shouldUseDevAuthLoopback.mockReturnValue(true)
    const idToken = makeTestJwt({
      sub: 'google-sub',
      email: 'user@gmail.com',
      name: 'Test User',
      picture: '',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    let deliverCb: ((params: {
      accessToken: string
      refreshToken?: string
      expiresIn?: number
    }) => void) | undefined

    const loopbackPromise = new Promise<{
      accessToken: string
      refreshToken?: string
      expiresIn?: number
    }>((resolve) => {
      // Resolved when openExternal has been called, via the HTTP callback path.
      deliverCb = resolve
    })

    devAuthMock.startDevAuthLoopback.mockResolvedValue({
      callbackUrl: 'http://127.0.0.1:5555/callback',
      promise: loopbackPromise,
      close: vi.fn(),
      deliver: vi.fn((params) => deliverCb?.(params)),
    })

    const signInPromise = startGoogleAccountSignIn()
    await Promise.resolve()
    await Promise.resolve()

    expect(devAuthMock.openDevAuthLoginInBrowser).toHaveBeenCalledWith(
      expect.stringMatching(
        /^http:\/\/127\.0\.0\.1:8000\/auth\/login\?.*redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A5555%2Fcallback/,
      ),
    )
    expect(electronMock.shell.openExternal).not.toHaveBeenCalled()

    deliverCb?.({
      accessToken: idToken,
      refreshToken: 'r1',
      expiresIn: 3600,
    })

    const account = await signInPromise
    expect(account.userInfo.email).toBe('user@gmail.com')
    devAuthMock.shouldUseDevAuthLoopback.mockReturnValue(false)
  })

  it('startGoogleAccountSignIn uses the system browser when packaged', async () => {
    devAuthMock.shouldUseDevAuthLoopback.mockReturnValue(false)
    const idToken = makeTestJwt({
      sub: 'google-sub',
      email: 'user@gmail.com',
      name: 'Test User',
      picture: '',
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const signInPromise = startGoogleAccountSignIn()
    await Promise.resolve()
    await Promise.resolve()

    expect(electronMock.shell.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
    )
    expect(devAuthMock.openDevAuthLoginInBrowser).not.toHaveBeenCalled()

    await handleGoogleAccountOAuthDeepLink({
      accessToken: idToken,
      expiresIn: 3600,
      scope: 'openid email profile',
    })
    const account = await signInPromise
    expect(account.userInfo.email).toBe('user@gmail.com')
  })
})
