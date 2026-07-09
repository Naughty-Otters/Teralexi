import { BrowserWindow } from 'electron'
import { loadStoredAccount } from '@main/services/google-account-oauth'
import { getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import { isEntitlementVerificationConfigured } from '@main/services/entitlement-config'
import type { EntitlementUiSnapshot } from '@shared/subscription/entitlement-types'
import {
  buildFailedEntitlementSnapshot,
  classifyEntitlementRefreshError,
  isAuthorizationBlocked,
  shouldRevokeLocalAuthSession,
} from '@shared/subscription/entitlement-auth-error'
import { createLogger } from '@main/logger'
import {
  checkTeralexiServerSession,
  fetchAndVerifyEntitlementFromNetwork,
  verifyCachedEntitlementLocally,
} from './entitlement-client'
import {
  clearEntitlementCache,
  getEntitlementCache,
  toEntitlementUiSnapshot,
} from './entitlement-store'
import { notifyEntitlementChanged } from './entitlement-notify'
import {
  onLocalAuthSessionCleared,
  revokeLocalTeralexiAuthSession,
} from './local-auth-session'
import { syncStoredGoogleAccountToRenderers } from '@main/services/google-account-notify'

const log = createLogger('services.entitlement-session')

export type EntitlementRefreshReason =
  | 'launch'
  | 'main-active'
  | 'conversation-started'
  | 'sign-in'
  | 'manual'

let inFlightRefresh: Promise<EntitlementUiSnapshot | null> | null = null
let lastSnapshot: EntitlementUiSnapshot | null = null

onLocalAuthSessionCleared(() => {
  lastSnapshot = null
  notifyEntitlementChanged(null)
})

function isSignedIn(): boolean {
  return loadStoredAccount() != null
}

function requiresServerSessionCheck(reason: EntitlementRefreshReason): boolean {
  return reason === 'launch' || reason === 'main-active' || reason === 'manual'
}

function pushSnapshot(snapshot: EntitlementUiSnapshot | null): EntitlementUiSnapshot | null {
  const prev = JSON.stringify(lastSnapshot)
  const next = JSON.stringify(snapshot)
  lastSnapshot = snapshot
  if (prev !== next) {
    notifyEntitlementChanged(snapshot)
  }
  return snapshot
}

function signOutDueToServerAuthFailure(
  message: string,
  context: Record<string, unknown> = {},
): EntitlementUiSnapshot | null {
  revokeLocalTeralexiAuthSession(message, context)
  return pushSnapshot(null)
}

function handleAuthFailure(
  reason: EntitlementRefreshReason,
  classified: { message: string; status?: number },
): EntitlementUiSnapshot | null {
  if (
    shouldRevokeLocalAuthSession({
      status: classified.status,
      message: classified.message,
      requiresServerSessionCheck: requiresServerSessionCheck(reason),
    })
  ) {
    return signOutDueToServerAuthFailure(classified.message, {
      reason,
      status: classified.status,
    })
  }
  clearEntitlementCache()
  return pushSnapshot(buildFailedEntitlementSnapshot(classified.message))
}

async function ensureServerSessionActive(
  apiBaseUrl: string,
  reason: EntitlementRefreshReason,
): Promise<EntitlementUiSnapshot | null | undefined> {
  if (!requiresServerSessionCheck(reason)) {
    log.debug('Skipping server session check for refresh reason', { reason })
    return undefined
  }

  log.info('Validating Teralexi server session', { reason, apiBaseUrl })
  const session = await checkTeralexiServerSession(apiBaseUrl)
  if (session.ok === true) {
    log.info('Teralexi server session is active', { reason })
    return undefined
  }

  if (session.ok === false) {
    log.warn('Teralexi server session is not active', {
      reason,
      status: session.status,
      message: session.message,
    })
    return signOutDueToServerAuthFailure(session.message, {
      reason,
      status: session.status,
    })
  }

  log.warn('Server session check skipped due to transient error', {
    reason,
    err: session.transientError,
  })
  return undefined
}

export function getEntitlementUiSnapshot(): EntitlementUiSnapshot | null {
  if (lastSnapshot) return lastSnapshot
  const cache = getEntitlementCache()
  if (!cache) return null
  return toEntitlementUiSnapshot(cache, 'stale')
}

export function isEntitlementAuthorizationReady(): boolean {
  if (!isSignedIn()) return true
  const snapshot = getEntitlementUiSnapshot()
  if (!snapshot) return false
  return !isAuthorizationBlocked(snapshot) && snapshot.verifyState !== 'unsigned'
}

/** Signed-in users must have a verified entitlement before gated features run. */
export function isEntitlementFeatureAllowed(feature: string): boolean {
  if (!isSignedIn()) return true
  const snapshot = getEntitlementUiSnapshot()
  if (!snapshot) return false
  if (snapshot.verifyState === 'failed' || snapshot.verifyState === 'unsigned') {
    return false
  }
  return snapshot.features.includes(feature)
}

export { isAuthorizationBlocked }

export async function refreshAuthAndEntitlement(
  reason: EntitlementRefreshReason = 'manual',
): Promise<EntitlementUiSnapshot | null> {
  if (inFlightRefresh) return inFlightRefresh

  inFlightRefresh = refreshAuthAndEntitlementImpl(reason).finally(() => {
    inFlightRefresh = null
  })
  return inFlightRefresh
}

async function refreshAuthAndEntitlementImpl(
  reason: EntitlementRefreshReason,
): Promise<EntitlementUiSnapshot | null> {
  log.info('Refreshing auth and entitlement', { reason })

  if (!isSignedIn()) {
    log.debug('Skipping refresh: no stored Google account', { reason })
    clearEntitlementCache()
    return pushSnapshot(null)
  }

  const apiBaseUrl = getTeralexiBaseApiUrl()
  if (!apiBaseUrl) {
    log.warn('Entitlement refresh skipped: API base URL is not configured', {
      reason,
    })
    return pushSnapshot(
      toEntitlementUiSnapshot(getEntitlementCache(), 'unsigned'),
    )
  }

  const sessionCheck = await ensureServerSessionActive(apiBaseUrl, reason)
  if (sessionCheck !== undefined) {
    return sessionCheck
  }

  if (!isEntitlementVerificationConfigured()) {
    log.warn('Entitlement refresh skipped: signing public key not configured', {
      reason,
      apiBaseUrl,
    })
    return pushSnapshot(
      toEntitlementUiSnapshot(getEntitlementCache(), 'unsigned'),
    )
  }

  try {
    const local = await verifyCachedEntitlementLocally()
    if (local) {
      return pushSnapshot(
        toEntitlementUiSnapshot(local.cache, local.verifyState),
      )
    }
  } catch (err) {
    log.info('Cached entitlement invalid; fetching fresh token', { reason, err })
  }

  try {
    const fresh = await fetchAndVerifyEntitlementFromNetwork()
    return pushSnapshot(
      toEntitlementUiSnapshot(fresh.cache, fresh.verifyState),
    )
  } catch (err) {
    const classified = classifyEntitlementRefreshError(err)
    log.warn('Entitlement refresh failed', {
      reason,
      kind: classified.kind,
      status: classified.status,
      err,
    })

    if (classified.kind === 'auth') {
      return handleAuthFailure(reason, classified)
    }

    const cache = getEntitlementCache()
    if (cache) {
      return pushSnapshot(toEntitlementUiSnapshot(cache, 'stale'))
    }

    return pushSnapshot(buildFailedEntitlementSnapshot(classified.message))
  }
}

export function clearEntitlementSession(): void {
  clearEntitlementCache()
  lastSnapshot = null
  notifyEntitlementChanged(null)
}

export function resetEntitlementSessionForTests(): void {
  inFlightRefresh = null
  lastSnapshot = null
  clearEntitlementCache()
}

function runBackgroundRefresh(reason: EntitlementRefreshReason): void {
  void refreshAuthAndEntitlement(reason).catch((err) => {
    log.warn('Entitlement refresh failed', { reason, err })
  })
}

/** @internal Used when main window becomes active. */
export function onMainWindowActive(): void {
  void (async () => {
    if (loadStoredAccount()) {
      await refreshAuthAndEntitlement('main-active')
    }
    syncStoredGoogleAccountToRenderers()
  })().catch((err) => {
    log.warn('Main window active auth refresh failed', { err })
    syncStoredGoogleAccountToRenderers()
  })
}

/** @internal Used when a new conversation is created. */
export function onConversationStarted(): void {
  runBackgroundRefresh('conversation-started')
}

/** @internal Used after successful Google sign-in. */
export function onGoogleAccountSignedIn(): void {
  runBackgroundRefresh('sign-in')
}

export function broadcastEntitlementToAllWindows(): void {
  const snapshot = getEntitlementUiSnapshot()
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    notifyEntitlementChanged(snapshot, window.webContents)
  }
}
