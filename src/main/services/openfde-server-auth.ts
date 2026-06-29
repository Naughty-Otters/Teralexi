import { decodeJwtPayload } from '@shared/google-id-token'
import { resolveMetricsApiBaseUrl } from '@shared/openfde-platform-api'
import { createLogger } from '@main/logger'
import { getOpenFdeAccountGoogleIdToken } from '@main/services/google-account-oauth'

export { resolveMetricsApiBaseUrl }

const log = createLogger('services.openfde-server-auth')

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

function resolveTokenExpiryMs(
  accessToken: string,
  expiresInSeconds?: number,
): number {
  const payload = decodeJwtPayload(accessToken)
  if (payload && typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
    return payload.exp * 1000
  }
  const ttlSeconds =
    expiresInSeconds && Number.isFinite(expiresInSeconds)
      ? expiresInSeconds
      : 3600
  return Date.now() + ttlSeconds * 1000
}

function cacheServerAccessToken(
  accessToken: string,
  expiresInSeconds?: number,
): string {
  cachedServerToken = {
    accessToken,
    expiresAtMs: resolveTokenExpiryMs(accessToken, expiresInSeconds),
  }
  return accessToken
}

function getValidCachedServerAccessToken(): string | null {
  if (!cachedServerToken) return null
  if (Date.now() >= cachedServerToken.expiresAtMs - 60_000) {
    cachedServerToken = null
    return null
  }
  return cachedServerToken.accessToken
}

export function clearOpenFdeServerAuthCache(): void {
  cachedServerToken = null
  inFlightServerToken = null
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
  return cacheServerAccessToken(accessToken, payload.expires_in)
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
  return cacheServerAccessToken(accessToken, payload.expires_in)
}

async function resolveOpenFdeServerAccessTokenImpl(
  apiBaseUrl: string,
): Promise<string | null> {
  const cached = getValidCachedServerAccessToken()
  if (cached) return cached

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

  const idToken = getOpenFdeAccountGoogleIdToken()
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

export async function getOpenFdeServerAccessToken(
  apiBaseUrl: string,
): Promise<string | null> {
  if (!apiBaseUrl.trim()) return null

  const cached = getValidCachedServerAccessToken()
  if (cached) return cached

  if (!inFlightServerToken) {
    inFlightServerToken = resolveOpenFdeServerAccessTokenImpl(apiBaseUrl).finally(
      () => {
        inFlightServerToken = null
      },
    )
  }

  return inFlightServerToken
}
