import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  clearStoredAccount,
  notifyGoogleAccountChanged,
  clearTeralexiServerAuthCache,
} = vi.hoisted(() => ({
  clearStoredAccount: vi.fn(),
  notifyGoogleAccountChanged: vi.fn(),
  clearTeralexiServerAuthCache: vi.fn(),
}))

vi.mock('@main/services/google-account-oauth', () => ({
  clearStoredAccount,
}))

vi.mock('@main/services/google-account-notify', () => ({
  notifyGoogleAccountChanged,
}))

vi.mock('@main/services/teralexi-server-auth', () => ({
  clearTeralexiServerAuthCache,
}))

import {
  onLocalAuthSessionCleared,
  resetLocalAuthSessionListenersForTests,
  revokeLocalTeralexiAuthSession,
} from './local-auth-session'
import { clearEntitlementCache, saveEntitlementCache } from './entitlement-store'

describe('local-auth-session', () => {
  afterEach(() => {
    resetLocalAuthSessionListenersForTests()
    vi.clearAllMocks()
  })

  it('revokeLocalTeralexiAuthSession clears persisted auth state', () => {
    saveEntitlementCache({
      plan: 'base',
      planName: 'Base',
      status: 'active',
      features: [],
      limits: {},
      revision: 1,
      entitlementToken: 'token',
      teralexiUserId: '42',
      fetchedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    })

    const listener = vi.fn()
    onLocalAuthSessionCleared(listener)

    revokeLocalTeralexiAuthSession('Unauthorized', {
      cause: 'server-session-rejected',
      status: 401,
    })

    expect(clearStoredAccount).toHaveBeenCalled()
    expect(clearTeralexiServerAuthCache).toHaveBeenCalled()
    expect(notifyGoogleAccountChanged).toHaveBeenCalledWith(null)
    expect(listener).toHaveBeenCalled()
  })
})
