import { BrowserWindow } from 'electron'
import { loadStoredAccount } from '@main/services/google-account-oauth'
import { getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import { isEntitlementVerificationConfigured } from '@main/services/entitlement-config'
import type { EntitlementUiSnapshot } from '@shared/subscription/entitlement-types'
import {
  buildFailedEntitlementSnapshot,
  classifyEntitlementRefreshError,
  decideAfterEntitlementAuthFailure,
  decideAfterServerSessionCheck,
  isAuthorizationBlocked,
  type ServerSessionOutcome,
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
  | 'timer'

/** How often to re-fetch entitlement while the app is active (docs: ~10 min). */
export const ENTITLEMENT_POLL_INTERVAL_MS = 10 * 60 * 1000

let inFlightRefresh: Promise<EntitlementUiSnapshot | null> | null = null
let lastSnapshot: EntitlementUiSnapshot | null = null
let entitlementPollTimer: ReturnType<typeof setInterval> | null = null

onLocalAuthSessionCleared(() => {
  lastSnapshot = null
  stopEntitlementPolling()
  notifyEntitlementChanged(null)
})

function isSignedIn(): boolean {
  return loadStoredAccount() != null
}

/** Session probe runs on cold start / focus / manual — never on fresh sign-in. */
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

function applyIdentityDecision(
  decision: ReturnType<typeof decideAfterServerSessionCheck>,
  context: Record<string, unknown>,
): EntitlementUiSnapshot | null | undefined {
  if (decision.action === 'revoke-identity') {
    revokeLocalTeralexiAuthSession(decision.message, {
      cause: decision.cause,
      ...context,
    })
    return pushSnapshot(null)
  }
  if (decision.blockAuthorization) {
    clearEntitlementCache()
    return pushSnapshot(
      buildFailedEntitlementSnapshot(
        decision.message ?? 'Teralexi authorization is not available',
      ),
    )
  }
  return undefined
}

function toServerSessionOutcome(
  session: Awaited<ReturnType<typeof checkTeralexiServerSession>>,
): ServerSessionOutcome {
  if (session.ok === true) return { kind: 'active' }
  if (session.ok === null) {
    return {
      kind: 'transient',
      message:
        session.transientError instanceof Error
          ? session.transientError.message
          : 'Transient server session error',
    }
  }
  if (session.reason === 'no-token') {
    return { kind: 'no-token', message: session.message }
  }
  const status = session.status === 403 ? 403 : 401
  return { kind: 'rejected', message: session.message, status }
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
  const outcome = toServerSessionOutcome(session)
  const decision = decideAfterServerSessionCheck(outcome)

  if (outcome.kind === 'active') {
    log.info('Teralexi server session is active', { reason })
    return undefined
  }

  if (outcome.kind === 'transient') {
    log.warn('Server session check skipped due to transient error', {
      reason,
      err: session.ok === null ? session.transientError : undefined,
    })
    return undefined
  }

  log.warn('Teralexi server session check outcome', {
    reason,
    kind: outcome.kind,
    decision: decision.action,
    message: outcome.message,
  })

  return applyIdentityDecision(decision, { reason, sessionKind: outcome.kind })
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

  // Identity may have been revoked by a confirmed /me rejection above.
  if (!isSignedIn()) {
    return pushSnapshot(null)
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
      // Policy: never revoke Google identity for entitlement failures.
      const decision = decideAfterEntitlementAuthFailure(classified.message)
      return applyIdentityDecision(decision, {
        reason,
        status: classified.status,
      }) as EntitlementUiSnapshot | null
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
  stopEntitlementPolling()
  inFlightRefresh = null
  lastSnapshot = null
  clearEntitlementCache()
}

function runBackgroundRefresh(reason: EntitlementRefreshReason): void {
  void refreshAuthAndEntitlement(reason).catch((err) => {
    log.warn('Entitlement refresh failed', { reason, err })
  })
}

/** Periodic entitlement refresh while a user is signed in. */
export function startEntitlementPolling(): void {
  if (entitlementPollTimer) return
  entitlementPollTimer = setInterval(() => {
    if (!loadStoredAccount()) return
    runBackgroundRefresh('timer')
  }, ENTITLEMENT_POLL_INTERVAL_MS)
  // Unref so the timer does not keep the process alive alone (Node/Electron).
  if (typeof entitlementPollTimer === 'object' && 'unref' in entitlementPollTimer) {
    entitlementPollTimer.unref()
  }
}

export function stopEntitlementPolling(): void {
  if (!entitlementPollTimer) return
  clearInterval(entitlementPollTimer)
  entitlementPollTimer = null
}

/** @internal Used when main window becomes active. */
export function onMainWindowActive(): void {
  startEntitlementPolling()
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

/**
 * After Google account is persisted from browser/website login.
 * Awaits entitlement refresh so authorization can catch up without clearing identity.
 */
export async function onGoogleAccountSignedIn(): Promise<EntitlementUiSnapshot | null> {
  startEntitlementPolling()
  try {
    return await refreshAuthAndEntitlement('sign-in')
  } catch (err) {
    log.warn('Entitlement refresh failed after Google sign-in', { err })
    return null
  }
}

export function broadcastEntitlementToAllWindows(): void {
  const snapshot = getEntitlementUiSnapshot()
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    notifyEntitlementChanged(snapshot, window.webContents)
  }
}
