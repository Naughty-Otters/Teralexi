import type { EntitlementUiSnapshot } from './entitlement-types'

export {
  decideAfterEntitlementAuthFailure,
  decideAfterServerSessionCheck,
  decideExplicitSignOut,
  shouldRevokeLocalAuthSession,
  type AuthIdentityDecision,
  type AuthIdentityRevokeCause,
  type ServerSessionOutcome,
} from '@shared/auth/auth-session-policy'

export class EntitlementAuthorizationError extends Error {
  readonly snapshot: EntitlementUiSnapshot | null
  readonly status?: number

  constructor(
    message: string,
    options: { snapshot?: EntitlementUiSnapshot | null; status?: number } = {},
  ) {
    super(message)
    this.name = 'EntitlementAuthorizationError'
    this.snapshot = options.snapshot ?? null
    this.status = options.status
  }
}

export type EntitlementRefreshErrorKind = 'auth' | 'transient'

export function classifyEntitlementRefreshError(err: unknown): {
  kind: EntitlementRefreshErrorKind
  message: string
  status?: number
} {
  const status = (err as { status?: number }).status
  const message =
    err instanceof Error ? err.message.trim() || 'Authorization failed' : String(err)

  if (status === 401 || status === 403) {
    return { kind: 'auth', message, status }
  }

  const authPattern =
    /access token is not available|entitlement.*mismatch|nonce mismatch|user mismatch|signing public key|spki|jwt|entitlement_token|unauthorized|forbidden|not configured/i
  if (authPattern.test(message)) {
    return { kind: 'auth', message, status }
  }

  if (err instanceof Error && /^(JWT|JOSE|JsonWebToken)/i.test(err.name)) {
    return { kind: 'auth', message, status }
  }

  return { kind: 'transient', message, status }
}

export function isAuthorizationBlocked(
  snapshot: EntitlementUiSnapshot | null | undefined,
): boolean {
  return snapshot?.verifyState === 'failed'
}

export function buildFailedEntitlementSnapshot(
  message: string,
): EntitlementUiSnapshot {
  const now = new Date().toISOString()
  return {
    plan: 'base',
    planName: 'Base',
    status: 'unauthorized',
    features: [],
    revision: 0,
    fetchedAt: now,
    expiresAt: now,
    verifyState: 'failed',
    errorMessage: message,
  }
}
