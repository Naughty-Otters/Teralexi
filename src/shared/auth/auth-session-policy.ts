/**
 * Auth session policy — identity vs server authorization.
 *
 * Two layers that must not be conflated:
 *
 * 1. **Google identity** (`~/.teralexi/accounts/google-account.json`)
 *    Shown as "signed in" in the UI. Cleared only by explicit logout or a
 *    *confirmed* server rejection of an established JWT.
 *
 * 2. **Server authorization** (platform JWT + entitlement)
 *    May be missing, stale, or failed without clearing identity. The UI then
 *    shows AuthorizationBlocked (signed-in but gated), never the lock screen.
 *
 * Regression class this prevents: website/browser login persists identity,
 * then a concurrent refresh (focus / cache clear / missing JWT) treats
 * "token not available" as 401 and revokes identity → UI stays locked.
 */

/** Why the local Google identity may be cleared. */
export type AuthIdentityRevokeCause =
  | 'user-sign-out'
  | 'web-logout'
  /** User requested permanent account deletion (Guideline 5.1.1(v)). */
  | 'user-account-deletion'
  /** `/api/v1/auth/me` returned 401/403 for a JWT we actually presented. */
  | 'server-session-rejected'

export type ServerSessionOutcome =
  | { kind: 'active' }
  /** Could not obtain a platform JWT (exchange pending/failed). Never revoke identity. */
  | { kind: 'no-token'; message: string }
  /** Server explicitly rejected the presented JWT. */
  | { kind: 'rejected'; message: string; status: 401 | 403 }
  | { kind: 'transient'; message: string }

export type AuthIdentityDecision =
  | { action: 'keep-identity'; blockAuthorization: boolean; message?: string }
  | { action: 'revoke-identity'; cause: AuthIdentityRevokeCause; message: string }

/** Explicit logout paths — always clear identity. */
export function decideExplicitSignOut(
  cause: 'user-sign-out' | 'web-logout' | 'user-account-deletion',
  message: string,
): AuthIdentityDecision {
  return { action: 'revoke-identity', cause, message }
}

/**
 * After validating the platform session (optional on some refresh reasons).
 * Missing JWT must never clear Google identity — that is the website-login race.
 */
export function decideAfterServerSessionCheck(
  outcome: ServerSessionOutcome,
): AuthIdentityDecision {
  switch (outcome.kind) {
    case 'active':
      return { action: 'keep-identity', blockAuthorization: false }
    case 'no-token':
      return {
        action: 'keep-identity',
        blockAuthorization: true,
        message: outcome.message,
      }
    case 'transient':
      return {
        action: 'keep-identity',
        blockAuthorization: false,
        message: outcome.message,
      }
    case 'rejected':
      return {
        action: 'revoke-identity',
        cause: 'server-session-rejected',
        message: outcome.message,
      }
  }
}

/**
 * Entitlement fetch/verify failures never clear Google identity.
 * User stays signed-in; gated features use AuthorizationBlocked.
 */
export function decideAfterEntitlementAuthFailure(message: string): AuthIdentityDecision {
  return {
    action: 'keep-identity',
    blockAuthorization: true,
    message,
  }
}

/** @deprecated Prefer {@link decideAfterServerSessionCheck}. Kept for call-site migration. */
export function shouldRevokeLocalAuthSession(args: {
  status?: number
  message: string
  requiresServerSessionCheck: boolean
}): boolean {
  if (!args.requiresServerSessionCheck) return false
  // "token not available" is no-token, not a confirmed rejection.
  if (/access token is not available|session is not available/i.test(args.message)) {
    return false
  }
  return args.status === 401 || args.status === 403
}
