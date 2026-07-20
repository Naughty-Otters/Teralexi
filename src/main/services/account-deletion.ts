import { createLogger } from '@main/logger'
import { getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import {
  deleteAccountServerSession,
  forceRefreshTeralexiServerAccessToken,
  getTeralexiServerAccessToken,
} from '@main/services/teralexi-server-auth'
import { revokeLocalTeralexiAuthSession } from '@main/services/local-auth-session'
import { clearEntitlementSession } from '@main/services/entitlement-session'

const log = createLogger('services.account-deletion')

/** Maps HTTP / flow outcomes for Settings UI copy. */
export type DeleteTeralexiAccountErrorCode =
  | 'confirm_required'
  | 'auth_required'
  | 'retryable'
  | 'unavailable'
  | 'no_session'
  | 'request_failed'

export type DeleteTeralexiAccountResult = {
  /** Server returned `{ ok: true }` — account hard-deleted. */
  serverDeleted: boolean
  /**
   * Local identity / tokens were cleared.
   * True after success, or when refresh fails on 401 (signed out).
   * False on 400 / 503 / other failures so the user can retry.
   */
  localCleared: boolean
  errorCode?: DeleteTeralexiAccountErrorCode
  serverMessage: string
}

function clearLocalIdentityAfterDeletion(): void {
  // Account (and refresh family) are already gone on the server — skip remote logout.
  revokeLocalTeralexiAuthSession('Account deleted from Teralexi', {
    cause: 'user-account-deletion',
    revokeRemote: false,
  })
  clearEntitlementSession()
}

function clearLocalIdentityAfterAuthFailure(message: string): void {
  revokeLocalTeralexiAuthSession(message, {
    cause: 'user-account-deletion',
  })
  clearEntitlementSession()
}

/**
 * Delete the user's Teralexi platform account per
 * OpenFDEServer `docs/subscription-integration/account-deletion.md`:
 *
 * 1. `DELETE /api/v1/auth/account` with Bearer + `{ confirm: true }`
 * 2. On 200 → clear local tokens
 * 3. On 401 → refresh once and retry; if refresh fails → sign out
 * 4. On 400 → confirm required (keep signed in)
 * 5. On 503 → retryable storage failure (keep signed in; account may still exist)
 */
export async function deleteTeralexiAccount(): Promise<DeleteTeralexiAccountResult> {
  const apiBaseUrl = getTeralexiBaseApiUrl()
  if (!apiBaseUrl) {
    log.warn('Account deletion aborted: API base URL not configured')
    return {
      serverDeleted: false,
      localCleared: false,
      errorCode: 'unavailable',
      serverMessage:
        'Platform API base URL is not configured. Set BASE_API and try again.',
    }
  }

  let accessToken = await getTeralexiServerAccessToken(apiBaseUrl)
  if (!accessToken) {
    accessToken = await forceRefreshTeralexiServerAccessToken(apiBaseUrl)
  }
  if (!accessToken) {
    log.warn('Account deletion: no session after refresh — signing out locally')
    clearLocalIdentityAfterAuthFailure(
      'No active platform session during account deletion',
    )
    return {
      serverDeleted: false,
      localCleared: true,
      errorCode: 'no_session',
      serverMessage:
        'Your session expired. You have been signed out. Sign in again if you still need to delete a remaining account.',
    }
  }

  let remote = await deleteAccountServerSession({
    apiBaseUrl,
    accessToken,
    confirm: true,
  })

  if (!remote.ok && remote.status === 401) {
    log.info('Account deletion got 401 — refreshing once and retrying')
    const refreshed = await forceRefreshTeralexiServerAccessToken(apiBaseUrl)
    if (!refreshed) {
      clearLocalIdentityAfterAuthFailure(
        'Session rejected during account deletion',
      )
      return {
        serverDeleted: false,
        localCleared: true,
        errorCode: 'auth_required',
        serverMessage:
          'Your session expired. You have been signed out. Sign in again to retry account deletion.',
      }
    }
    remote = await deleteAccountServerSession({
      apiBaseUrl,
      accessToken: refreshed,
      confirm: true,
    })
  }

  if (remote.ok) {
    clearLocalIdentityAfterDeletion()
    return {
      serverDeleted: true,
      localCleared: true,
      serverMessage: '',
    }
  }

  log.warn('Account deletion API failed', {
    status: remote.status,
    message: remote.message,
  })

  if (remote.status === 400) {
    return {
      serverDeleted: false,
      localCleared: false,
      errorCode: 'confirm_required',
      serverMessage:
        remote.message ||
        'Confirmation is required to delete your account. Try again.',
    }
  }

  if (remote.status === 503) {
    return {
      serverDeleted: false,
      localCleared: false,
      errorCode: 'retryable',
      serverMessage:
        remote.message ||
        'Account cleanup hit a temporary storage error. Your account may still exist — please retry.',
    }
  }

  return {
    serverDeleted: false,
    localCleared: false,
    errorCode: 'request_failed',
    serverMessage: remote.message,
  }
}
