import { describe, expect, it } from 'vitest'
import {
  decideAfterEntitlementAuthFailure,
  decideAfterServerSessionCheck,
  decideExplicitSignOut,
  shouldRevokeLocalAuthSession,
} from './auth-session-policy'

describe('auth-session-policy', () => {
  describe('decideAfterServerSessionCheck', () => {
    it('keeps identity when session is active', () => {
      expect(decideAfterServerSessionCheck({ kind: 'active' })).toEqual({
        action: 'keep-identity',
        blockAuthorization: false,
      })
    })

    it('keeps identity when platform JWT is missing (website-login race)', () => {
      expect(
        decideAfterServerSessionCheck({
          kind: 'no-token',
          message: 'Teralexi server session is not available',
        }),
      ).toEqual({
        action: 'keep-identity',
        blockAuthorization: true,
        message: 'Teralexi server session is not available',
      })
    })

    it('keeps identity on transient errors', () => {
      expect(
        decideAfterServerSessionCheck({
          kind: 'transient',
          message: 'network down',
        }).action,
      ).toBe('keep-identity')
    })

    it('revokes identity only when the server rejects a presented JWT', () => {
      expect(
        decideAfterServerSessionCheck({
          kind: 'rejected',
          message: 'Unauthorized',
          status: 401,
        }),
      ).toEqual({
        action: 'revoke-identity',
        cause: 'server-session-rejected',
        message: 'Unauthorized',
      })
    })
  })

  describe('decideAfterEntitlementAuthFailure', () => {
    it('never revokes Google identity for entitlement 401s', () => {
      const decision = decideAfterEntitlementAuthFailure(
        'Teralexi server access token is not available',
      )
      expect(decision).toEqual({
        action: 'keep-identity',
        blockAuthorization: true,
        message: 'Teralexi server access token is not available',
      })
    })
  })

  describe('decideExplicitSignOut', () => {
    it('revokes on user and web logout', () => {
      expect(decideExplicitSignOut('user-sign-out', 'bye').cause).toBe(
        'user-sign-out',
      )
      expect(decideExplicitSignOut('web-logout', 'bye').cause).toBe('web-logout')
    })
  })

  describe('shouldRevokeLocalAuthSession (compat)', () => {
    it('does not revoke for missing-token messages even with session check', () => {
      expect(
        shouldRevokeLocalAuthSession({
          status: 401,
          message: 'Teralexi server session is not available',
          requiresServerSessionCheck: true,
        }),
      ).toBe(false)
      expect(
        shouldRevokeLocalAuthSession({
          message: 'Teralexi server access token is not available',
          requiresServerSessionCheck: true,
        }),
      ).toBe(false)
    })

    it('revokes only for confirmed rejection status without missing-token wording', () => {
      expect(
        shouldRevokeLocalAuthSession({
          status: 401,
          message: 'Unauthorized',
          requiresServerSessionCheck: true,
        }),
      ).toBe(true)
    })

    it('never revokes when session check is not required (sign-in)', () => {
      expect(
        shouldRevokeLocalAuthSession({
          status: 401,
          message: 'Unauthorized',
          requiresServerSessionCheck: false,
        }),
      ).toBe(false)
    })
  })
})
