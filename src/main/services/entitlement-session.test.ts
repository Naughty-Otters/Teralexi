import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntitlementCache } from '@shared/subscription/entitlement-types'

const accountsDir = join(process.cwd(), '.tmp-entitlement-session-test')

const {
  loadStoredAccount,
  clearStoredAccount,
  verifyCachedEntitlementLocally,
  fetchAndVerifyEntitlementFromNetwork,
  checkTeralexiServerSession,
  revokeLocalTeralexiAuthSession,
  notifyGoogleAccountChanged,
} = vi.hoisted(() => ({
  loadStoredAccount: vi.fn(),
  clearStoredAccount: vi.fn(),
  verifyCachedEntitlementLocally: vi.fn(),
  fetchAndVerifyEntitlementFromNetwork: vi.fn(),
  checkTeralexiServerSession: vi.fn(),
  revokeLocalTeralexiAuthSession: vi.fn(),
  notifyGoogleAccountChanged: vi.fn(),
}))

vi.mock('@main/services/google-account-oauth', () => ({
  loadStoredAccount,
  clearStoredAccount,
}))

vi.mock('@main/services/teralexi-platform-config', () => ({
  getTeralexiBaseApiUrl: () => 'http://localhost:8000',
}))

vi.mock('./entitlement-config', () => ({
  isEntitlementVerificationConfigured: vi.fn(() => true),
}))

vi.mock('./entitlement-client', () => ({
  verifyCachedEntitlementLocally,
  fetchAndVerifyEntitlementFromNetwork,
  checkTeralexiServerSession,
}))

vi.mock('./entitlement-notify', () => ({
  notifyEntitlementChanged: vi.fn(),
}))

vi.mock('./local-auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./local-auth-session')>()
  return {
    ...actual,
    revokeLocalTeralexiAuthSession,
  }
})

vi.mock('@main/services/google-account-notify', () => ({
  notifyGoogleAccountChanged,
}))

vi.mock('@config/teralexi-home', () => ({
  getTeralexiAccountsDir: () => accountsDir,
}))

import {
  clearEntitlementSession,
  getEntitlementUiSnapshot,
  onGoogleAccountSignedIn,
  refreshAuthAndEntitlement,
  resetEntitlementSessionForTests,
} from './entitlement-session'
import { isEntitlementVerificationConfigured } from './entitlement-config'
import {
  resetEntitlementStoreForTests,
  saveEntitlementCache,
} from './entitlement-store'

const sampleCache: EntitlementCache = {
  plan: 'base',
  planName: 'Base',
  status: 'active',
  features: ['metrics.write', 'support.upload'],
  limits: {},
  revision: 1,
  entitlementToken: 'token',
  teralexiUserId: '42',
  fetchedAt: new Date().toISOString(),
  serverTime: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
}

function resetEntitlementTestMocks(): void {
  vi.mocked(isEntitlementVerificationConfigured).mockReturnValue(true)
  checkTeralexiServerSession.mockResolvedValue({ ok: true })
  verifyCachedEntitlementLocally.mockResolvedValue(null)
  fetchAndVerifyEntitlementFromNetwork.mockResolvedValue(null)
}

describe('refreshAuthAndEntitlement', () => {
  beforeEach(() => {
    resetEntitlementSessionForTests()
    resetEntitlementStoreForTests()
    mkdirSync(accountsDir, { recursive: true })
    resetEntitlementTestMocks()
  })

  afterEach(() => {
    resetEntitlementSessionForTests()
    resetEntitlementStoreForTests()
    rmSync(accountsDir, { recursive: true, force: true })
    vi.clearAllMocks()
    resetEntitlementTestMocks()
  })

  it('clears entitlement when user is signed out', async () => {
    loadStoredAccount.mockReturnValue(null)
    const snapshot = await refreshAuthAndEntitlement('manual')
    expect(snapshot).toBeNull()
    expect(verifyCachedEntitlementLocally).not.toHaveBeenCalled()
  })

  it('uses cached token when local verification succeeds after server session check', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockResolvedValue({
      cache: sampleCache,
      verifyState: 'verified',
    })

    const snapshot = await refreshAuthAndEntitlement('main-active')

    expect(checkTeralexiServerSession).toHaveBeenCalledWith('http://localhost:8000')
    expect(verifyCachedEntitlementLocally).toHaveBeenCalled()
    expect(fetchAndVerifyEntitlementFromNetwork).not.toHaveBeenCalled()
    expect(snapshot).toMatchObject({
      plan: 'base',
      verifyState: 'verified',
      features: ['metrics.write', 'support.upload'],
    })
  })

  it('validates server session even when entitlement signing key is not configured', async () => {
    vi.mocked(isEntitlementVerificationConfigured).mockReturnValue(false)
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    checkTeralexiServerSession.mockResolvedValue({ ok: true })

    await refreshAuthAndEntitlement('launch')

    expect(checkTeralexiServerSession).toHaveBeenCalledWith('http://localhost:8000')
    expect(verifyCachedEntitlementLocally).not.toHaveBeenCalled()
  })

  it('skips server session check for conversation-started', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockResolvedValue({
      cache: sampleCache,
      verifyState: 'verified',
    })

    await refreshAuthAndEntitlement('conversation-started')

    expect(checkTeralexiServerSession).not.toHaveBeenCalled()
  })

  it('signs out locally when server rejects an established JWT on launch', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    checkTeralexiServerSession.mockResolvedValue({
      ok: false,
      reason: 'rejected',
      message: 'Unauthorized',
      status: 401,
    })

    const snapshot = await refreshAuthAndEntitlement('launch')

    expect(revokeLocalTeralexiAuthSession).toHaveBeenCalledWith(
      'Unauthorized',
      expect.objectContaining({
        cause: 'server-session-rejected',
        reason: 'launch',
      }),
    )
    expect(snapshot).toBeNull()
    expect(verifyCachedEntitlementLocally).not.toHaveBeenCalled()
  })

  it('keeps Google identity when platform JWT is missing on launch', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    checkTeralexiServerSession.mockResolvedValue({
      ok: false,
      reason: 'no-token',
      message: 'Teralexi server session is not available',
    })

    const snapshot = await refreshAuthAndEntitlement('launch')

    expect(revokeLocalTeralexiAuthSession).not.toHaveBeenCalled()
    expect(snapshot?.verifyState).toBe('failed')
    expect(loadStoredAccount).toHaveBeenCalled()
  })

  it('fetches from network when local verification fails', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockRejectedValue(new Error('expired'))
    fetchAndVerifyEntitlementFromNetwork.mockResolvedValue({
      cache: sampleCache,
      verifyState: 'verified',
    })

    const snapshot = await refreshAuthAndEntitlement('conversation-started')

    expect(fetchAndVerifyEntitlementFromNetwork).toHaveBeenCalled()
    expect(snapshot?.verifyState).toBe('verified')
  })

  it('deduplicates concurrent refresh calls', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ cache: sampleCache, verifyState: 'verified' }),
            20,
          )
        }),
    )

    const [a, b] = await Promise.all([
      refreshAuthAndEntitlement('main-active'),
      refreshAuthAndEntitlement('main-active'),
    ])

    expect(a).toEqual(b)
    expect(verifyCachedEntitlementLocally).toHaveBeenCalledTimes(1)
  })

  it('keeps the local account on authorization failures during sign-in', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockResolvedValue(null)
    const authError = new Error('Teralexi server access token is not available') as Error & {
      status?: number
    }
    authError.status = 401
    fetchAndVerifyEntitlementFromNetwork.mockRejectedValue(authError)

    const snapshot = await refreshAuthAndEntitlement('sign-in')

    expect(revokeLocalTeralexiAuthSession).not.toHaveBeenCalled()
    expect(snapshot?.verifyState).toBe('failed')
  })

  /**
   * Regression: website login persists Google identity, then focus triggers
   * main-active while the platform JWT is still missing. Must not lock the UI.
   */
  it('keeps signed-in after website login when main-active sees no-token', async () => {
    loadStoredAccount.mockReturnValue({
      userInfo: { sub: 'g-1', email: 'u@example.com' },
      tokens: { id_token: 'google-id' },
    })
    verifyCachedEntitlementLocally.mockResolvedValue({
      cache: sampleCache,
      verifyState: 'verified',
    })

    await onGoogleAccountSignedIn()
    expect(revokeLocalTeralexiAuthSession).not.toHaveBeenCalled()

    checkTeralexiServerSession.mockResolvedValue({
      ok: false,
      reason: 'no-token',
      message: 'Teralexi server session is not available',
    })

    const snapshot = await refreshAuthAndEntitlement('main-active')

    expect(revokeLocalTeralexiAuthSession).not.toHaveBeenCalled()
    expect(snapshot?.verifyState).toBe('failed')
    expect(getEntitlementUiSnapshot()?.verifyState).toBe('failed')
  })

  it('blocks without signing out for non-session auth failures', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockResolvedValue(null)
    fetchAndVerifyEntitlementFromNetwork.mockRejectedValue(
      new Error('Entitlement response missing entitlement_token'),
    )

    const snapshot = await refreshAuthAndEntitlement('conversation-started')

    expect(revokeLocalTeralexiAuthSession).not.toHaveBeenCalled()
    expect(snapshot?.verifyState).toBe('failed')
  })

  it('returns stale cache for transient network failures', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    saveEntitlementCache(sampleCache)
    verifyCachedEntitlementLocally.mockResolvedValue(null)
    fetchAndVerifyEntitlementFromNetwork.mockRejectedValue(new Error('fetch failed'))

    const snapshot = await refreshAuthAndEntitlement('main-active')

    expect(snapshot?.verifyState).toBe('stale')
    expect(snapshot?.features).toEqual(['metrics.write', 'support.upload'])
  })

  it('clearEntitlementSession resets snapshot', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockResolvedValue({
      cache: sampleCache,
      verifyState: 'verified',
    })
    await refreshAuthAndEntitlement('manual')
    clearEntitlementSession()
    loadStoredAccount.mockReturnValue(null)
    const snapshot = await refreshAuthAndEntitlement('manual')
    expect(snapshot).toBeNull()
  })
})
