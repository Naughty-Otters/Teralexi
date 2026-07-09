import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EntitlementCache } from '@shared/subscription/entitlement-types'

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

import {
  clearEntitlementSession,
  getEntitlementUiSnapshot,
  refreshAuthAndEntitlement,
  resetEntitlementSessionForTests,
} from './entitlement-session'
import { isEntitlementVerificationConfigured } from './entitlement-config'
import { saveEntitlementCache } from './entitlement-store'

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

describe('refreshAuthAndEntitlement', () => {
  afterEach(() => {
    resetEntitlementSessionForTests()
    vi.clearAllMocks()
    vi.mocked(isEntitlementVerificationConfigured).mockReturnValue(true)
    checkTeralexiServerSession.mockResolvedValue({ ok: true })
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

  it('signs out locally when server session is revoked on launch', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    checkTeralexiServerSession.mockResolvedValue({
      ok: false,
      message: 'Teralexi server session is not available',
      status: 401,
    })

    const snapshot = await refreshAuthAndEntitlement('launch')

    expect(revokeLocalTeralexiAuthSession).toHaveBeenCalledWith(
      'Teralexi server session is not available',
      expect.objectContaining({ reason: 'launch', status: 401 }),
    )
    expect(snapshot).toBeNull()
    expect(verifyCachedEntitlementLocally).not.toHaveBeenCalled()
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

  it('signs out locally on authorization failures during sign-in', async () => {
    loadStoredAccount.mockReturnValue({ userInfo: { sub: 'g-1' } })
    verifyCachedEntitlementLocally.mockResolvedValue(null)
    const authError = new Error('Teralexi server access token is not available') as Error & {
      status?: number
    }
    authError.status = 401
    fetchAndVerifyEntitlementFromNetwork.mockRejectedValue(authError)

    const snapshot = await refreshAuthAndEntitlement('sign-in')

    expect(revokeLocalTeralexiAuthSession).toHaveBeenCalled()
    expect(snapshot).toBeNull()
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
