import { joinTeralexiPlatformUrl } from '@shared/teralexi-platform-api'
import type {
  EntitlementApiResponse,
  EntitlementCache,
} from '@shared/subscription/entitlement-types'
import { getTeralexiBaseApiUrl } from './teralexi-platform-config'
import { getTeralexiServerAccessToken } from './teralexi-server-auth'
import { verifyEntitlementToken } from './entitlement-verifier'
import {
  buildEntitlementCache,
  getEntitlementCache,
  saveEntitlementCache,
} from './entitlement-store'

export type TeralexiMeResponse = {
  id: number
  sub_id: string
  email: string
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    detail?: string
    message?: string
  }
  if (!response.ok) {
    const message =
      (payload as { detail?: string }).detail ||
      (payload as { message?: string }).message ||
      `Request failed with HTTP ${response.status}`
    const error = new Error(message) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return payload
}

export async function fetchTeralexiCurrentUser(
  apiBaseUrl: string,
  accessToken: string,
): Promise<TeralexiMeResponse> {
  const url = joinTeralexiPlatformUrl(apiBaseUrl, 'api/v1/auth/me')
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  return parseJsonResponse<TeralexiMeResponse>(response)
}

export type TeralexiServerSessionCheck =
  | { ok: true }
  | { ok: false; message: string; status?: number }
  | { ok: null; transientError: unknown }

/**
 * Validate the current server session via /api/v1/auth/me.
 * Soft-expired JWTs are refreshed first so hourly `exp` does not force sign-out.
 */
export async function checkTeralexiServerSession(
  apiBaseUrl: string,
): Promise<TeralexiServerSessionCheck> {
  let accessToken: string | null = null
  try {
    accessToken = await getTeralexiServerAccessToken(apiBaseUrl)
  } catch (err) {
    return { ok: null, transientError: err }
  }
  if (!accessToken) {
    return {
      ok: false,
      message: 'Teralexi server session is not available',
      status: 401,
    }
  }

  try {
    await fetchTeralexiCurrentUser(apiBaseUrl, accessToken)
    return { ok: true }
  } catch (err) {
    const status = (err as { status?: number }).status
    const message =
      err instanceof Error ? err.message : 'Teralexi server session check failed'
    if (status === 401 || status === 403) {
      return { ok: false, message, status }
    }
    return { ok: null, transientError: err }
  }
}

export async function fetchEntitlementFromServer(args: {
  apiBaseUrl: string
  accessToken: string
  requestId: string
}): Promise<EntitlementApiResponse> {
  const url = joinTeralexiPlatformUrl(
    args.apiBaseUrl,
    'api/v1/subscription/entitlement',
  )
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
      'X-Request-Id': args.requestId,
    },
  })
  return parseJsonResponse<EntitlementApiResponse>(response)
}

export async function verifyCachedEntitlementLocally(): Promise<{
  cache: EntitlementCache
  verifyState: 'verified' | 'stale'
} | null> {
  const apiBaseUrl = getTeralexiBaseApiUrl()
  const cache = getEntitlementCache()
  if (!apiBaseUrl || !cache?.entitlementToken) return null

  const claims = await verifyEntitlementToken({
    entitlementToken: cache.entitlementToken,
    apiBaseUrl,
    teralexiUserId: cache.teralexiUserId,
  })

  const verifiedCache =
    claims.teralexiUserId === cache.teralexiUserId
      ? cache
      : buildEntitlementCache({
          entitlementToken: cache.entitlementToken,
          teralexiUserId: claims.teralexiUserId,
          claims,
          serverTime: cache.serverTime,
        })

  if (verifiedCache !== cache) {
    saveEntitlementCache(verifiedCache)
  }

  return { cache: verifiedCache, verifyState: 'verified' }
}

export async function fetchAndVerifyEntitlementFromNetwork(): Promise<{
  cache: EntitlementCache
  verifyState: 'verified'
}> {
  const apiBaseUrl = getTeralexiBaseApiUrl()
  if (!apiBaseUrl) {
    throw new Error('Teralexi API base URL is not configured')
  }

  const accessToken = await getTeralexiServerAccessToken(apiBaseUrl)
  if (!accessToken) {
    const error = new Error('Teralexi server access token is not available') as Error & {
      status?: number
    }
    error.status = 401
    throw error
  }

  const me = await fetchTeralexiCurrentUser(apiBaseUrl, accessToken)
  const teralexiUserId = String(me.id)
  const requestId = crypto.randomUUID()
  const body = await fetchEntitlementFromServer({
    apiBaseUrl,
    accessToken,
    requestId,
  })

  const token = body.entitlement_token?.trim()
  if (!token) {
    throw new Error('Entitlement response missing entitlement_token')
  }

  const claims = await verifyEntitlementToken({
    entitlementToken: token,
    apiBaseUrl,
    teralexiUserId,
    requestId,
  })

  const cache = buildEntitlementCache({
    entitlementToken: token,
    teralexiUserId,
    claims,
    serverTime: body.payload?.server_time,
  })
  saveEntitlementCache(cache)
  return { cache, verifyState: 'verified' }
}
