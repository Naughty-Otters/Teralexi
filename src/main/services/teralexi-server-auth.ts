import { decodeJwtPayload } from '@shared/google-id-token'
import { resolveMetricsApiBaseUrl } from '@shared/teralexi-platform-api'
import { createLogger } from '@main/logger'
import { getTeralexiAccountGoogleIdToken } from '@main/services/google-account-oauth'
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

let cachedServerToken: CachedServerToken | null = null
let inFlightServerToken: Promise<string | null> | null = null

/** Treat token as expired this many ms before JWT `exp` (refresh / clock-skew buffer). */
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
    log.info('Server JWT past refresh buffer; treating as expired', {
      context,
      ...timing,
      note:
        'expiresAtMs is absolute wall-clock expiry; now >= expiresAtMs - refreshBufferMs means within the buffer window',
    })
  } else {
    log.debug('Server JWT still valid before refresh buffer', {
      context,
      ...timing,
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
  cachedServerToken = {
    accessToken,
    expiresAtMs,
  }
  log.info('Cached server JWT', {
    source,
    ...describeServerTokenExpiry(expiresAtMs),
    note:
      'expiresAtMs is stored as absolute expiry; refresh buffer is applied only when reading the cache',
  })
  if (apiBaseUrl?.trim()) {
    savePersistedServerAuth({
      apiBaseUrl,
      accessToken,
      expiresAtMs,
    })
  }
  return accessToken
}

function getValidCachedServerAccessToken(): string | null {
  if (!cachedServerToken) return null
  if (
    isServerTokenPastRefreshBuffer(
      cachedServerToken.expiresAtMs,
      'in-memory cache',
    )
  ) {
    cachedServerToken = null
    return null
  }
  return cachedServerToken.accessToken
}

export function clearTeralexiServerAuthCache(): void {
  cachedServerToken = null
  inFlightServerToken = null
  clearPersistedServerAuth()
}

/** Session validation only — never exchanges Google id_token. */
export function getPersistedServerAccessTokenForSessionCheck(
  apiBaseUrl: string,
): string | null {
  const inMemory = getValidCachedServerAccessToken()
  if (inMemory) return inMemory

  const record = loadPersistedServerAuth()
  if (!record) return null
  const normalized = apiBaseUrl.trim().replace(/\/+$/, '')
  const recordBase = record.apiBaseUrl.trim().replace(/\/+$/, '')
  if (recordBase !== normalized) return null
  if (
    isServerTokenPastRefreshBuffer(
      record.expiresAtMs,
      'persisted server-auth.json (session check)',
    )
  ) {
    return null
  }

  cachedServerToken = {
    accessToken: record.accessToken,
    expiresAtMs: record.expiresAtMs,
  }
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
}): Promise<string> {
  const response = await fetch(`${args.apiBaseUrl}/api/v1/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ id_token: args.idToken }),
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
}): Promise<string> {
  const response = await fetch(`${args.apiBaseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
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
  const cached = getValidCachedServerAccessToken()
  if (cached) return cached

  const persisted = getPersistedServerAccessToken(apiBaseUrl)
  if (persisted) {
    const record = loadPersistedServerAuth()
    if (record) {
      cachedServerToken = {
        accessToken: record.accessToken,
        expiresAtMs: record.expiresAtMs,
      }
      return persisted
    }
  }

  const staleToken = cachedServerToken?.accessToken
  if (staleToken) {
    try {
      return await refreshServerAccessToken({
        apiBaseUrl,
        accessToken: staleToken,
      })
    } catch (err) {
      log.warn('Server JWT refresh failed; re-exchanging Google id_token', { err })
      cachedServerToken = null
    }
  }

  const idToken = getTeralexiAccountGoogleIdToken()
  if (!idToken) return null

  try {
    return await exchangeGoogleIdTokenForServerAccessToken({
      apiBaseUrl,
      idToken,
    })
  } catch (err) {
    log.warn('Failed to exchange Google id_token for server JWT', { err })
    return null
  }
}

export async function getTeralexiServerAccessToken(
  apiBaseUrl: string,
): Promise<string | null> {
  if (!apiBaseUrl.trim()) return null

  const cached = getValidCachedServerAccessToken()
  if (cached) return cached

  if (!inFlightServerToken) {
    inFlightServerToken = resolveTeralexiServerAccessTokenImpl(apiBaseUrl).finally(
      () => {
        inFlightServerToken = null
      },
    )
  }

  return inFlightServerToken
}
