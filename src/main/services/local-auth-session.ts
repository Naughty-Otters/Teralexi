import { createLogger } from '@main/logger'
import { clearStoredAccount } from '@main/services/google-account-oauth'
import { notifyGoogleAccountChanged } from '@main/services/google-account-notify'
import { clearTeralexiServerAuthCache } from '@main/services/teralexi-server-auth'
import type { AuthIdentityRevokeCause } from '@shared/auth/auth-session-policy'
import { clearEntitlementCache } from './entitlement-store'

const log = createLogger('services.local-auth-session')

const clearedListeners = new Set<() => void>()

export function onLocalAuthSessionCleared(listener: () => void): void {
  clearedListeners.add(listener)
}

export function resetLocalAuthSessionListenersForTests(): void {
  clearedListeners.clear()
}

export type RevokeLocalAuthContext = {
  /** Required — forces callers to declare why identity is cleared. */
  cause: AuthIdentityRevokeCause
  /**
   * When true (default), best-effort `POST /auth/logout` before wiping tokens.
   * Set false after account deletion — the refresh family is already gone.
   */
  revokeRemote?: boolean
} & Record<string, unknown>

/**
 * Clear persisted Google identity, server JWT, and entitlement.
 *
 * Call only for {@link AuthIdentityRevokeCause} values. Entitlement / missing-JWT
 * failures must NOT use this — see `@shared/auth/auth-session-policy`.
 */
export function revokeLocalTeralexiAuthSession(
  message: string,
  context: RevokeLocalAuthContext,
): void {
  const { cause, revokeRemote = true, ...rest } = context
  log.warn('Signing out locally', { message, cause, revokeRemote, ...rest })
  clearStoredAccount()
  // Capture + POST /auth/logout with refresh_token before wiping local cache.
  clearTeralexiServerAuthCache({ revokeRemote })
  clearEntitlementCache()
  notifyGoogleAccountChanged(null)
  for (const listener of clearedListeners) {
    listener()
  }
}
