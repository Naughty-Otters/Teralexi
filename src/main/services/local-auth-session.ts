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
  log.warn('Signing out locally', { message, ...context })
  clearStoredAccount()
  // Capture + POST /auth/logout with refresh_token before wiping local cache.
  clearTeralexiServerAuthCache({ revokeRemote: true })
  clearEntitlementCache()
  notifyGoogleAccountChanged(null)
  for (const listener of clearedListeners) {
    listener()
  }
}
