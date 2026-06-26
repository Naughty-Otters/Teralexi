import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn(async () => undefined) },
}))

vi.mock('node:https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn((_key: string, fallback = '') => fallback),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeAccountsDir: vi.fn(() => '/accounts'),
}))

vi.mock('@main/services/google-account-notify', () => ({
  notifyGoogleAccountChanged: vi.fn(),
}))

import {
  applyGoogleAccountOAuthCallback,
  clearStoredAccount,
  googleAccountSignInIsConfigured,
  loadStoredAccount,
  resolveOpenFdeGoogleAuthLoginUrl,
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

  it('resolveOpenFdeGoogleAuthLoginUrl uses dev fallback when env unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(resolveOpenFdeGoogleAuthLoginUrl()).toBe(
      'http://localhost:8000/auth/login',
    )
    vi.unstubAllEnvs()
  })

  it('resolveOpenFdeGoogleAuthLoginUrl prefers env override', () => {
    vi.mocked(getSystemPropValue).mockReturnValue('https://auth.example/login')
    expect(resolveOpenFdeGoogleAuthLoginUrl()).toBe('https://auth.example/login')
  })

  it('googleAccountSignInIsConfigured is true with default URL', () => {
    expect(googleAccountSignInIsConfigured()).toBe(true)
  })

  it('startGoogleAccountSignIn rejects when auth URL is empty in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.mocked(getSystemPropValue).mockReturnValue('')
    await expect(startGoogleAccountSignIn()).rejects.toMatchObject({
      message: GOOGLE_ACCOUNT_NOT_CONFIGURED,
    })
    vi.unstubAllEnvs()
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
    expect(account.tokens.id_token).toBe(idToken)
    expect(account.tokens.access_token).toBe('')
  })

  it('loadStoredAccount returns null when no file', () => {
    expect(loadStoredAccount()).toBeNull()
  })

  it('clearStoredAccount is safe when missing', () => {
    expect(() => clearStoredAccount()).not.toThrow()
  })
})
