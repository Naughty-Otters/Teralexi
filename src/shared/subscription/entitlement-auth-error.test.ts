import { describe, expect, it } from 'vitest'
import {
  EntitlementAuthorizationError,
  buildFailedEntitlementSnapshot,
  classifyEntitlementRefreshError,
  isAuthorizationBlocked,
  shouldRevokeLocalAuthSession,
} from './entitlement-auth-error'

describe('classifyEntitlementRefreshError', () => {
  it('classifies 401 as auth', () => {
    const err = new Error('Unauthorized') as Error & { status?: number }
    err.status = 401
    expect(classifyEntitlementRefreshError(err)).toMatchObject({
      kind: 'auth',
      status: 401,
    })
  })

  it('classifies missing access token as auth', () => {
    expect(
      classifyEntitlementRefreshError(
        new Error('Teralexi server access token is not available'),
      ).kind,
    ).toBe('auth')
  })

  it('classifies network failures as transient', () => {
    expect(
      classifyEntitlementRefreshError(new Error('fetch failed')).kind,
    ).toBe('transient')
  })
})

describe('authorization helpers', () => {
  it('marks failed snapshots as blocked', () => {
    const snapshot = buildFailedEntitlementSnapshot('bad token')
    expect(isAuthorizationBlocked(snapshot)).toBe(true)
    expect(snapshot.errorMessage).toBe('bad token')
  })

  it('creates EntitlementAuthorizationError with snapshot', () => {
    const snapshot = buildFailedEntitlementSnapshot('denied')
    const err = new EntitlementAuthorizationError('denied', { snapshot, status: 401 })
    expect(err.snapshot).toEqual(snapshot)
    expect(err.status).toBe(401)
  })
})

describe('shouldRevokeLocalAuthSession', () => {
  it('does not revoke for missing-token messages', () => {
    expect(
      shouldRevokeLocalAuthSession({
        status: 401,
        message: 'Teralexi server session is not available',
        requiresServerSessionCheck: true,
      }),
    ).toBe(false)
  })

  it('revokes on confirmed Unauthorized when session check is required', () => {
    expect(
      shouldRevokeLocalAuthSession({
        status: 401,
        message: 'Unauthorized',
        requiresServerSessionCheck: true,
      }),
    ).toBe(true)
  })

  it('does not revoke during sign-in style refreshes', () => {
    expect(
      shouldRevokeLocalAuthSession({
        status: 401,
        message: 'Unauthorized',
        requiresServerSessionCheck: false,
      }),
    ).toBe(false)
  })
})
