import { clearStoredAccount } from '@main/services/google-account-oauth'
import { notifyGoogleAccountChanged } from '@main/services/google-account-notify'
import { clearTeralexiServerAuthCache } from '@main/services/teralexi-server-auth'
import { createLogger } from '@main/logger'
import { clearEntitlementCache } from './entitlement-store'

const log = createLogger('services.local-auth-session')

const clearedListeners = new Set<() => void>()

export function onLocalAuthSessionCleared(listener: () => void): void {
  clearedListeners.add(listener)
}

export function resetLocalAuthSessionListenersForTests(): void {
  clearedListeners.clear()
}

/** Clear persisted Google account, server JWT cache, and entitlement cache. */
export function revokeLocalTeralexiAuthSession(
  message: string,
  context: Record<string, unknown> = {},
): void {
  log.warn('Server session invalid; signing out locally', { message, ...context })
  clearStoredAccount()
  clearTeralexiServerAuthCache()
  clearEntitlementCache()
  notifyGoogleAccountChanged(null)
  for (const listener of clearedListeners) {
    listener()
  }
}
