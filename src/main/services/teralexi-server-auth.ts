import { decodeJwtPayload, isGoogleIdToken } from '@shared/google-id-token'
import {
  joinTeralexiPlatformUrl,
  resolveMetricsApiBaseUrl,
  TERALEXI_PLATFORM_PATHS,
} from '@shared/teralexi-platform-api'
import { createLogger } from '@main/logger'
import {
  getStoredPresentedServerAccessToken,
  getStoredPresentedServerRefreshToken,
  getTeralexiAccountGoogleIdToken,
} from '@main/services/google-account-oauth'
import {
  clearPersistedServerAuth,
  getPersistedServerAccessToken,
  getPersistedServerRefreshToken,
  loadPersistedServerAuth,
  savePersistedServerAuth,
} from './server-auth-store'

export { resolveMetricsApiBaseUrl }

const log = createLogger('services.teralexi-server-auth')

type CachedServerToken = {
  accessToken: string
  refreshToken?: string
  expiresAtMs: number
  refreshExpiresAtMs?: number
}

type ServerAuthResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_expires_in?: number
  token_type?: string
}

/** In-memory JWTs keyed by normalized API base URL. */
const cachedServerTokenByApiBase = new Map<string, CachedServerToken>()
/** In-flight resolve promises keyed by normalized API base URL. */
const inFlightServerTokenByApiBase = new Map<string, Promise<string | null>>()
/** Last reason resolve returned null — for actionable UI / logs (not a server body). */
let lastResolveFailure: string | null = null

/** Default timeout for `/auth/google`, `/auth/refresh`, and `/auth/logout` fetches. */
export const TERALEXI_AUTH_FETCH_TIMEOUT_MS = 30_000

function authFetchSignal(timeoutMs = TERALEXI_AUTH_FETCH_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

function normalizeApiBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function authUrl(apiBaseUrl: string, path: string): string {
  return joinTeralexiPlatformUrl(apiBaseUrl, path)
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

function cacheServerTokens(args: {
  accessToken: string
  refreshToken?: string
  expiresInSeconds?: number
  refreshExpiresInSeconds?: number
  apiBaseUrl?: string
}): string {
  const { expiresAtMs, source } = resolveTokenExpiryMs(
    args.accessToken,
    args.expiresInSeconds,
  )
  const key = args.apiBaseUrl?.trim() ? normalizeApiBase(args.apiBaseUrl) : ''
  const previous = key ? cachedServerTokenByApiBase.get(key) : undefined
  const refreshToken =
    args.refreshToken?.trim() || previous?.refreshToken || undefined
  const refreshExpiresAtMs =
    args.refreshExpiresInSeconds && Number.isFinite(args.refreshExpiresInSeconds)
      ? Date.now() + args.refreshExpiresInSeconds * 1000
      : args.refreshToken?.trim()
        ? undefined
        : previous?.refreshExpiresAtMs

  if (key) {
    cachedServerTokenByApiBase.set(key, {
      accessToken: args.accessToken,
      refreshToken,
      expiresAtMs,
      refreshExpiresAtMs,
    })
  }
  log.info('Cached server JWT', {
    source,
    apiBaseUrl: key || undefined,
    hasRefreshToken: Boolean(refreshToken),
    ...describeServerTokenExpiry(expiresAtMs),
    note:
      'expiresAtMs is stored as absolute expiry; refresh buffer is applied only when reading the cache',
  })
  if (key) {
    savePersistedServerAuth({
      apiBaseUrl: key,
      accessToken: args.accessToken,
      expiresAtMs,
      refreshToken,
      refreshExpiresAtMs,
    })
  }
  return args.accessToken
}

/**
 * Persist platform tokens presented by the website deep link
 * (`teralexi://open?access_token=&refresh_token=`).
 */
export function acceptPresentedServerAccessToken(args: {
  accessToken: string
  apiBaseUrl: string
  expiresInSeconds?: number
  refreshToken?: string
  refreshExpiresInSeconds?: number
}): string {
  return cacheServerTokens({
    accessToken: args.accessToken,
    refreshToken: args.refreshToken,
    expiresInSeconds: args.expiresInSeconds,
    refreshExpiresInSeconds: args.refreshExpiresInSeconds,
    apiBaseUrl: args.apiBaseUrl,
  })
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
    // Keep token in memory so resolve can refresh via refresh_token.
    return null
  }
  return cached.accessToken
}

function hydrateCacheFromPersisted(apiBaseUrl: string): CachedServerToken | null {
  const record = loadPersistedServerAuth()
  if (!record?.accessToken) return null
  if (normalizeApiBase(record.apiBaseUrl) !== normalizeApiBase(apiBaseUrl)) {
    return null
  }
  const cached: CachedServerToken = {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAtMs: record.expiresAtMs,
    refreshExpiresAtMs: record.refreshExpiresAtMs,
  }
  cachedServerTokenByApiBase.set(normalizeApiBase(apiBaseUrl), cached)
  return cached
}

function getRefreshTokenForApiBase(apiBaseUrl: string): string | null {
  const cached = getCachedServerTokenRecord(apiBaseUrl)
  if (cached?.refreshToken?.trim()) return cached.refreshToken.trim()
  const persisted = getPersistedServerRefreshToken(apiBaseUrl)
  if (persisted) {
    hydrateCacheFromPersisted(apiBaseUrl)
    return persisted
  }
  // Do not pull refresh from google-account.json here — that path is only for
  // presenting a brand-new platform handoff (handled after refresh fails).
  return null
}

/**
 * Clear local platform session. When `revokeRemote` is true, best-effort
 * `POST /api/v1/auth/logout` with the current refresh token first.
 */
export function clearTeralexiServerAuthCache(options?: {
  revokeRemote?: boolean
}): void {
  const record = options?.revokeRemote ? loadPersistedServerAuth() : null
  const refreshToken = record?.refreshToken?.trim()
  const apiBaseUrl = record?.apiBaseUrl

  cachedServerTokenByApiBase.clear()
  inFlightServerTokenByApiBase.clear()
  lastResolveFailure = null
  clearPersistedServerAuth()

  if (options?.revokeRemote && refreshToken && apiBaseUrl) {
    void logoutServerSession({ apiBaseUrl, refreshToken }).catch((err) => {
      log.warn('Remote logout failed after local clear', { err })
    })
  }
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
    refreshToken: record.refreshToken,
    expiresAtMs: record.expiresAtMs,
    refreshExpiresAtMs: record.refreshExpiresAtMs,
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

function applyAuthPayload(
  payload: ServerAuthResponse,
  apiBaseUrl: string,
  missingTokenError: string,
): string {
  const accessToken = payload.access_token?.trim()
  if (!accessToken) {
    throw new Error(missingTokenError)
  }
  return cacheServerTokens({
    accessToken,
    refreshToken: payload.refresh_token,
    expiresInSeconds: payload.expires_in,
    refreshExpiresInSeconds: payload.refresh_expires_in,
    apiBaseUrl,
  })
}

export async function exchangeGoogleIdTokenForServerAccessToken(args: {
  apiBaseUrl: string
  idToken: string
  timeoutMs?: number
}): Promise<string> {
  const response = await fetch(
    authUrl(args.apiBaseUrl, TERALEXI_PLATFORM_PATHS.authGoogle),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ id_token: args.idToken }),
      signal: authFetchSignal(args.timeoutMs),
    },
  )

  const payload = await parseAuthResponse(response)
  return applyAuthPayload(
    payload,
    args.apiBaseUrl,
    'Auth response missing access_token',
  )
}

/**
 * Renew access via opaque refresh token rotation
 * (`POST /api/v1/auth/refresh`). Always replace the stored refresh token.
 */
export async function refreshServerAccessToken(args: {
  apiBaseUrl: string
  refreshToken: string
  timeoutMs?: number
}): Promise<string> {
  const response = await fetch(
    authUrl(args.apiBaseUrl, TERALEXI_PLATFORM_PATHS.authRefresh),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh_token: args.refreshToken }),
      signal: authFetchSignal(args.timeoutMs),
    },
  )

  const payload = await parseAuthResponse(response)
  return applyAuthPayload(
    payload,
    args.apiBaseUrl,
    'Token refresh response missing access_token',
  )
}

/** Revoke the refresh-token family on the server (best-effort). */
export async function logoutServerSession(args: {
  apiBaseUrl: string
  refreshToken: string
  timeoutMs?: number
}): Promise<void> {
  const response = await fetch(
    authUrl(args.apiBaseUrl, TERALEXI_PLATFORM_PATHS.authLogout),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh_token: args.refreshToken }),
      signal: authFetchSignal(args.timeoutMs),
    },
  )
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string
      message?: string
    }
    throw new Error(
      payload.detail ||
        payload.message ||
        `Logout failed with HTTP ${response.status}`,
    )
  }
}

export type DeleteAccountServerResult =
  | { ok: true }
  | { ok: false; status: number; message: string }

/**
 * Permanently delete the platform account (`DELETE /api/v1/auth/account`).
 * Contract: {@link https://github.com/Naughty-Otters} OpenFDEServer
 * `docs/subscription-integration/account-deletion.md` — body must be
 * `{ "confirm": true }` with Bearer access JWT.
 */
export async function deleteAccountServerSession(args: {
  apiBaseUrl: string
  accessToken: string
  /** Must be true — server rejects anything else with 400. */
  confirm?: boolean
  timeoutMs?: number
}): Promise<DeleteAccountServerResult> {
  const confirm = args.confirm !== false
  const response = await fetch(
    authUrl(args.apiBaseUrl, TERALEXI_PLATFORM_PATHS.authDeleteAccount),
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
      },
      body: JSON.stringify({ confirm }),
      signal: authFetchSignal(args.timeoutMs),
    },
  )
  if (response.ok || response.status === 204) {
    return { ok: true }
  }
  const payload = (await response.json().catch(() => ({}))) as {
    detail?: string
    message?: string
  }
  return {
    ok: false,
    status: response.status,
    message:
      payload.detail ||
      payload.message ||
      `Account deletion failed with HTTP ${response.status}`,
  }
}

/**
 * Optional re-bind of Google while the access token is still valid
 * (`POST /api/v1/auth/token` with a fresh Google id_token).
 */
export async function rebindGoogleIdToken(args: {
  apiBaseUrl: string
  accessToken: string
  idToken: string
  timeoutMs?: number
}): Promise<string> {
  const response = await fetch(
    authUrl(args.apiBaseUrl, TERALEXI_PLATFORM_PATHS.authToken),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${args.accessToken}`,
      },
      body: JSON.stringify({ id_token: args.idToken }),
      signal: authFetchSignal(args.timeoutMs),
    },
  )
  const payload = await parseAuthResponse(response)
  return applyAuthPayload(
    payload,
    args.apiBaseUrl,
    'Google re-bind response missing access_token',
  )
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
        refreshToken: record.refreshToken,
        expiresAtMs: record.expiresAtMs,
        refreshExpiresAtMs: record.refreshExpiresAtMs,
      })
      return persisted
    }
  }

  // Soft-expired / near-expiry: rotate via refresh_token (not /auth/token).
  const refreshToken = getRefreshTokenForApiBase(apiBaseUrl)
  if (refreshToken) {
    try {
      log.info('Refreshing soft-expired server JWT via refresh_token', {
        apiBaseUrl: key,
      })
      return await refreshServerAccessToken({
        apiBaseUrl,
        refreshToken,
      })
    } catch (err) {
      log.warn('Server JWT refresh_token rotation failed', { err })
      cachedServerTokenByApiBase.delete(key)
      // Refresh family may be revoked — drop persisted tokens so we do not
      // retry a dead refresh_token (caller may still exchange Google id_token).
      const record = loadPersistedServerAuth()
      if (record && normalizeApiBase(record.apiBaseUrl) === key) {
        clearPersistedServerAuth()
      }
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
    return cacheServerTokens({
      accessToken: presented,
      refreshToken: getStoredPresentedServerRefreshToken() ?? undefined,
      apiBaseUrl,
    })
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

/**
 * Force `/auth/refresh` even when the access JWT is still within the soft buffer.
 * Used when an API call returns 401 with a seemingly-valid local JWT.
 */
export async function forceRefreshTeralexiServerAccessToken(
  apiBaseUrl: string,
): Promise<string | null> {
  if (!apiBaseUrl.trim()) {
    return setResolveFailure('Teralexi API base URL is not configured')
  }
  const refreshToken = getRefreshTokenForApiBase(apiBaseUrl)
  if (!refreshToken) {
    return setResolveFailure(
      'No refresh_token available to renew the platform session',
    )
  }
  try {
    lastResolveFailure = null
    return await refreshServerAccessToken({ apiBaseUrl, refreshToken })
  } catch (err) {
    log.warn('Forced server JWT refresh failed', { err })
    cachedServerTokenByApiBase.delete(normalizeApiBase(apiBaseUrl))
    return setResolveFailure(
      err instanceof Error
        ? `Server token refresh failed: ${err.message}`
        : 'Server token refresh failed',
    )
  }
}
