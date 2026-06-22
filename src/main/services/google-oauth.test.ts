import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: vi.fn(),
}))

vi.mock('node:https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}))

vi.mock('@config/index', () => ({
  default: { google: { clientId: '', clientSecret: '' } },
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn((_key: string, fallback = '') => fallback),
}))

vi.mock('@config/google-oauth-defaults', () => ({
  BUNDLED_GOOGLE_OAUTH_CLIENT_ID: '',
  BUNDLED_GOOGLE_OAUTH_CLIENT_SECRET: '',
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeAccountsDir: vi.fn(() => '/accounts'),
}))

import {
  clearStoredAccount,
  googleAccountHasWorkspaceAccess,
  googleOAuthIsConfigured,
  GOOGLE_WORKSPACE_SCOPES,
  loadStoredAccount,
  resolveGoogleOAuthCredentials,
  startGoogleSignIn,
} from './google-oauth'
import { GOOGLE_OAUTH_NOT_CONFIGURED } from '@shared/google-oauth-settings'
import { getSystemPropValue } from '@config/system-prop'

describe('google-oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    vi.mocked(getSystemPropValue).mockImplementation(
      (_key: string, fallback = '') => fallback,
    )
  })

  it('resolveGoogleOAuthCredentials falls back to bundled defaults', () => {
    expect(resolveGoogleOAuthCredentials()).toEqual({
      clientId: '',
      clientSecret: '',
    })
  })

  it('resolveGoogleOAuthCredentials prefers config.properties values', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.google.clientId') return 'custom-id'
      if (key === 'app.google.clientSecret') return 'custom-secret'
      return ''
    })
    expect(resolveGoogleOAuthCredentials()).toEqual({
      clientId: 'custom-id',
      clientSecret: 'custom-secret',
    })
  })

  it('googleOAuthIsConfigured is false without a client ID', () => {
    expect(googleOAuthIsConfigured()).toBe(false)
  })

  it('googleOAuthIsConfigured is true when client ID is set', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) =>
      key === 'app.google.clientId' ? 'custom-id' : '',
    )
    expect(googleOAuthIsConfigured()).toBe(true)
  })

  it('startGoogleSignIn rejects when OAuth client is not configured', async () => {
    await expect(startGoogleSignIn()).rejects.toMatchObject({
      message: GOOGLE_OAUTH_NOT_CONFIGURED,
    })
  })

  it('GOOGLE_WORKSPACE_SCOPES includes Gmail read and compose', () => {
    expect(GOOGLE_WORKSPACE_SCOPES).toContain(
      'https://www.googleapis.com/auth/gmail.readonly',
    )
    expect(GOOGLE_WORKSPACE_SCOPES).toContain(
      'https://www.googleapis.com/auth/gmail.compose',
    )
  })

  it('googleAccountHasWorkspaceAccess requires all workspace scopes', () => {
    expect(googleAccountHasWorkspaceAccess(GOOGLE_WORKSPACE_SCOPES.join(' '))).toBe(
      true,
    )
    expect(googleAccountHasWorkspaceAccess('openid email profile')).toBe(false)
  })

  it('loadStoredAccount returns null when no file', () => {
    expect(loadStoredAccount()).toBeNull()
  })

  it('clearStoredAccount is safe when missing', () => {
    expect(() => clearStoredAccount()).not.toThrow()
  })
})
