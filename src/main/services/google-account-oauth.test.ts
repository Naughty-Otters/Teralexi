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

import { isPackagedRuntime } from '@config/env-overrides'
import {
  applyGoogleAccountOAuthCallback,
  clearStoredAccount,
  googleAccountSignInIsConfigured,
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

  it('resolveTeralexiGoogleAuthLoginUrl uses dev fallback when env unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(resolveTeralexiGoogleAuthLoginUrl()).toBe(
      'https://api.teralexi.com/auth/login',
    )
    vi.unstubAllEnvs()
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
})
