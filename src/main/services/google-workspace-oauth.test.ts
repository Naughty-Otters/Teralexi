import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

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

vi.mock('@main/services/google-workspace-account-notify', () => ({
  notifyGoogleWorkspaceAccountChanged: vi.fn(),
}))

import {
  clearStoredAccount,
  googleAccountHasWorkspaceAccess,
  googleWorkspaceOAuthIsConfigured,
  GOOGLE_WORKSPACE_SCOPES,
  loadStoredAccount,
  resolveGoogleWorkspaceOAuthCredentials,
  startGoogleWorkspaceSignIn,
} from './google-workspace-oauth'
import { GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED } from '@shared/google-workspace-settings'
import { getSystemPropValue } from '@config/system-prop'

describe('google-workspace-oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSystemPropValue).mockImplementation(
      (_key: string, fallback = '') => fallback,
    )
  })

  it('resolveGoogleWorkspaceOAuthCredentials reads canonical app.google.clientId', () => {
    vi.mocked(getSystemPropValue).mockImplementation((key: string) => {
      if (key === 'app.google.clientId') return 'canonical-id'
      if (key === 'app.google.clientSecret') return 'canonical-secret'
      return ''
    })
    expect(resolveGoogleWorkspaceOAuthCredentials()).toEqual({
      clientId: 'canonical-id',
      clientSecret: 'canonical-secret',
    })
  })

  it('googleWorkspaceOAuthIsConfigured is false without a client ID', () => {
    expect(googleWorkspaceOAuthIsConfigured()).toBe(false)
  })

  it('startGoogleWorkspaceSignIn rejects when not configured', async () => {
    await expect(startGoogleWorkspaceSignIn()).rejects.toMatchObject({
      message: GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED,
    })
  })

  it('GOOGLE_WORKSPACE_SCOPES includes Gmail read and compose', () => {
    expect(GOOGLE_WORKSPACE_SCOPES).toContain(
      'https://www.googleapis.com/auth/gmail.readonly',
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
