import { decodeJwtPayload, isGoogleIdToken } from '@shared/google-id-token'
import { resolveMetricsApiBaseUrl } from '@shared/teralexi-platform-api'
import { createLogger } from '@main/logger'
import {
  getStoredPresentedServerAccessToken,
  getTeralexiAccountGoogleIdToken,
} from '@main/services/google-account-oauth'
import {
  clearPersistedServerAuth,
  getPersistedServerAccessToken,
  loadPersistedServerAuth,
  savePersistedServerAuth,
} from './server-auth-store'

export { resolveMetricsApiBaseUrl }

const log = createLogger('services.teralexi-server-auth')

type CachedServerToken = {
  accessToken: string
  expiresAtMs: number
}

type ServerAuthResponse = {
  access_token?: string
  expires_in?: number
  token_type?: string
}

/** In-memory JWTs keyed by normalized API base URL. */
const cachedServerTokenByApiBase = new Map<string, CachedServerToken>()
/** In-flight resolve promises keyed by normalized API base URL. */
const inFlightServerTokenByApiBase = new Map<string, Promise<string | null>>()
/** Last reason resolve returned null — for actionable UI / logs (not a server body). */
let lastResolveFailure: string | null = null

/** Default timeout for `/auth/google` and `/auth/token` fetches. */
export const TERALEXI_AUTH_FETCH_TIMEOUT_MS = 30_000

function authFetchSignal(timeoutMs = TERALEXI_AUTH_FETCH_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

function normalizeApiBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function getLastServerAccessTokenFailure(): string | null {
  return lastResolveFailure
}

function setResolveFailure(message: string): null {
  lastResolveFailure = message
  return null
}

/** Treat token as needing refresh this many ms before JWT `exp` (clock-skew buffer). */
const SERVER_TOKEN_REFRESH_BUFFER_MS = 60_000

function describeServerTokenExpiry(expiresAtMs: number, nowMs = Date.now()) {
  const effectiveExpiryMs = expiresAtMs - SERVER_TOKEN_REFRESH_BUFFER_MS
  return {
    nowMs,
    expiresAtMs,
    refreshBufferMs: SERVER_TOKEN_REFRESH_BUFFER_MS,
    effectiveExpiryMs,
    remainingMs: expiresAtMs - nowMs,
    expiresAtIso: new Date(expiresAtMs).toISOString(),
    effectiveExpiryIso: new Date(effectiveExpiryMs).toISOString(),
  }
}

function isServerTokenPastRefreshBuffer(
  expiresAtMs: number,
  context: string,
  nowMs = Date.now(),
): boolean {
  const past = nowMs >= expiresAtMs - SERVER_TOKEN_REFRESH_BUFFER_MS
  const timing = describeServerTokenExpiry(expiresAtMs, nowMs)
  if (past) {
    log.info('Server JWT past refresh buffer; treating as needing refresh', {
      context,
      ...timing,
      note:
        'expiresAtMs is absolute wall-clock expiry; now >= expiresAtMs - refreshBufferMs means within the buffer window',
    })
  } 
  return past
}

function resolveTokenExpiryMs(
  accessToken: string,
  expiresInSeconds?: number,
): { expiresAtMs: number; source: 'jwt-exp' | 'expires-in-fallback' } {
  const payload = decodeJwtPayload(accessToken)
  if (payload && typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
    return { expiresAtMs: payload.exp * 1000, source: 'jwt-exp' }
  }
  const ttlSeconds =
    expiresInSeconds && Number.isFinite(expiresInSeconds)
      ? expiresInSeconds
      : 3600
  return {
    expiresAtMs: Date.now() + ttlSeconds * 1000,
    source: 'expires-in-fallback',
  }
}

function cacheServerAccessToken(
  accessToken: string,
  expiresInSeconds?: number,
  apiBaseUrl?: string,
): string {
  const { expiresAtMs, source } = resolveTokenExpiryMs(accessToken, expiresInSeconds)
  const key = apiBaseUrl?.trim() ? normalizeApiBase(apiBaseUrl) : ''
  if (key) {
    cachedServerTokenByApiBase.set(key, {
      accessToken,
      expiresAtMs,
    })
  }
  log.info('Cached server JWT', {
    source,
    apiBaseUrl: key || undefined,
    ...describeServerTokenExpiry(expiresAtMs),
    note:
      'expiresAtMs is stored as absolute expiry; refresh buffer is applied only when reading the cache',
  })
  if (key) {
    savePersistedServerAuth({
      apiBaseUrl: key,
      accessToken,
      expiresAtMs,
    })
  }
  return accessToken
}

/**
 * Persist a platform JWT presented by the website deep link (not a Google id_token).
 * Used when `teralexi://open?token=` carries the Teralexi server session directly.
 */
export function acceptPresentedServerAccessToken(args: {
  accessToken: string
  apiBaseUrl: string
  expiresInSeconds?: number
}): string {
  return cacheServerAccessToken(
    args.accessToken,
    args.expiresInSeconds,
    args.apiBaseUrl,
  )
}

/** True when the bearer looks like a non-Google JWT (likely Teralexi platform session). */
export function isLikelyPresentedServerAccessToken(token: string): boolean {
  const trimmed = token.trim()
  if (!trimmed || isGoogleIdToken(trimmed)) return false
  const payload = decodeJwtPayload(trimmed)
  return payload != null
}

function getCachedServerTokenRecord(
  apiBaseUrl: string,
): CachedServerToken | null {
  const key = normalizeApiBase(apiBaseUrl)
  if (!key) return null
  return cachedServerTokenByApiBase.get(key) ?? null
}

function getValidCachedServerAccessToken(apiBaseUrl: string): string | null {
  const cached = getCachedServerTokenRecord(apiBaseUrl)
  if (!cached) return null
  if (
    isServerTokenPastRefreshBuffer(
      cached.expiresAtMs,
      `in-memory cache (${normalizeApiBase(apiBaseUrl)})`,
    )
  ) {
    // Keep token in memory so resolveTeralexiServerAccessTokenImpl can refresh it.
    return null
  }
  return cached.accessToken
}

/**
 * Return a token suitable for POST /api/v1/auth/token even when past the refresh
 * buffer. Prefer in-memory, then persisted; keep the JWT until refresh fails.
 */
function getServerAccessTokenForRefresh(apiBaseUrl: string): string | null {
  const cached = getCachedServerTokenRecord(apiBaseUrl)
  if (cached?.accessToken) {
    return cached.accessToken
  }
  const record = loadPersistedServerAuth()
  if (!record?.accessToken) return null
  if (normalizeApiBase(record.apiBaseUrl) !== normalizeApiBase(apiBaseUrl)) {
    return null
  }
  cachedServerTokenByApiBase.set(normalizeApiBase(apiBaseUrl), {
    accessToken: record.accessToken,
    expiresAtMs: record.expiresAtMs,
  })
  return record.accessToken
}

export function clearTeralexiServerAuthCache(): void {
  cachedServerTokenByApiBase.clear()
  inFlightServerTokenByApiBase.clear()
  lastResolveFailure = null
  clearPersistedServerAuth()
}

/** Session validation only — never exchanges Google id_token. */
export function getPersistedServerAccessTokenForSessionCheck(
  apiBaseUrl: string,
): string | null {
  const inMemory = getValidCachedServerAccessToken(apiBaseUrl)
  if (inMemory) return inMemory

  const record = loadPersistedServerAuth()
  if (!record) return null
  const normalized = normalizeApiBase(apiBaseUrl)
  const recordBase = normalizeApiBase(record.apiBaseUrl)
  if (recordBase !== normalized) return null
  if (
    isServerTokenPastRefreshBuffer(
      record.expiresAtMs,
      'persisted server-auth.json (session check)',
    )
  ) {
    return null
  }

  cachedServerTokenByApiBase.set(normalized, {
    accessToken: record.accessToken,
    expiresAtMs: record.expiresAtMs,
  })
  return record.accessToken
}

async function parseAuthResponse(response: Response): Promise<ServerAuthResponse> {
  const payload = (await response.json().catch(() => ({}))) as ServerAuthResponse & {
    detail?: string
    message?: string
  }
  if (!response.ok) {
    throw new Error(
      payload.detail ||
        payload.message ||
        `Auth request failed with HTTP ${response.status}`,
    )
  }
  return payload
}

export async function exchangeGoogleIdTokenForServerAccessToken(args: {
  apiBaseUrl: string
  idToken: string
  timeoutMs?: number
}): Promise<string> {
  const response = await fetch(`${args.apiBaseUrl}/api/v1/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ id_token: args.idToken }),
    signal: authFetchSignal(args.timeoutMs),
  })

  const payload = await parseAuthResponse(response)
  const accessToken = payload.access_token?.trim()
  if (!accessToken) {
    throw new Error('Auth response missing access_token')
  }
  return cacheServerAccessToken(accessToken, payload.expires_in, args.apiBaseUrl)
}

export async function refreshServerAccessToken(args: {
  apiBaseUrl: string
  accessToken: string
  timeoutMs?: number
}): Promise<string> {
  const response = await fetch(`${args.apiBaseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    signal: authFetchSignal(args.timeoutMs),
  })

  const payload = await parseAuthResponse(response)
  const accessToken = payload.access_token?.trim()
  if (!accessToken) {
    throw new Error('Token refresh response missing access_token')
  }
  return cacheServerAccessToken(accessToken, payload.expires_in, args.apiBaseUrl)
}

async function resolveTeralexiServerAccessTokenImpl(
  apiBaseUrl: string,
): Promise<string | null> {
  lastResolveFailure = null
  const key = normalizeApiBase(apiBaseUrl)

  const cached = getValidCachedServerAccessToken(apiBaseUrl)
  if (cached) return cached

  const persisted = getPersistedServerAccessToken(apiBaseUrl)
  if (persisted) {
    const record = loadPersistedServerAuth()
    if (record) {
      cachedServerTokenByApiBase.set(key, {
        accessToken: record.accessToken,
        expiresAtMs: record.expiresAtMs,
      })
      return persisted
    }
  }

  // Soft-expired / near-expiry: refresh while the prior JWT is still acceptable.
  const refreshCandidate = getServerAccessTokenForRefresh(apiBaseUrl)
  if (refreshCandidate) {
    try {
      log.info('Refreshing soft-expired server JWT', {
        apiBaseUrl: key,
      })
      return await refreshServerAccessToken({
        apiBaseUrl,
        accessToken: refreshCandidate,
      })
    } catch (err) {
      log.warn('Server JWT refresh failed; re-exchanging Google id_token', { err })
      cachedServerTokenByApiBase.delete(key)
      // Continue to exchange; keep refresh error if exchange also fails.
      lastResolveFailure =
        err instanceof Error
          ? `Server token refresh failed: ${err.message}`
          : 'Server token refresh failed'
    }
  }

  // Website deep link may have stored a platform JWT as access_token.
  const presented = getStoredPresentedServerAccessToken()
  if (presented) {
    log.info('Using presented platform JWT from Google account store as server session', {
      apiBaseUrl: key,
    })
    return cacheServerAccessToken(presented, undefined, apiBaseUrl)
  }

  const idToken = getTeralexiAccountGoogleIdToken()
  if (!idToken) {
    log.warn(
      'No local server JWT and no Google id_token to exchange; cannot obtain remote session',
      { apiBaseUrl: key },
    )
    return setResolveFailure(
      'No platform session and no Google id_token to exchange. Sign in again from the app.',
    )
  }

  try {
    log.info('Local server JWT missing; exchanging Google id_token remotely', {
      apiBaseUrl: key,
    })
    return await exchangeGoogleIdTokenForServerAccessToken({
      apiBaseUrl,
      idToken,
    })
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : 'Google id_token exchange failed'
    log.warn('Failed to exchange Google id_token for server JWT', { err })
    return setResolveFailure(
      `Could not exchange Google sign-in for a platform token (${detail}). Check API base URL and /api/v1/auth/google.`,
    )
  }
}

export async function getTeralexiServerAccessToken(
  apiBaseUrl: string,
): Promise<string | null> {
  if (!apiBaseUrl.trim()) {
    return setResolveFailure('Teralexi API base URL is not configured')
  }

  const cached = getValidCachedServerAccessToken(apiBaseUrl)
  if (cached) {
    lastResolveFailure = null
    return cached
  }

  const key = normalizeApiBase(apiBaseUrl)
  let inFlight = inFlightServerTokenByApiBase.get(key)
  if (!inFlight) {
    inFlight = resolveTeralexiServerAccessTokenImpl(apiBaseUrl).finally(() => {
      if (inFlightServerTokenByApiBase.get(key) === inFlight) {
        inFlightServerTokenByApiBase.delete(key)
      }
    })
    inFlightServerTokenByApiBase.set(key, inFlight)
  }

  return inFlight
}
