import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTeralexiAccountsDir } from '@config/teralexi-home'
import { createLogger } from '@main/logger'

const log = createLogger('services.server-auth-store')

const AUTH_FILE = 'server-auth.json'

export type PersistedServerAuth = {
  accessToken: string
  /** Opaque platform refresh token — rotated on every `/auth/refresh`. */
  refreshToken?: string
  expiresAtMs: number
  /** Absolute expiry of the current refresh token family when known. */
  refreshExpiresAtMs?: number
  apiBaseUrl: string
}

let memoryAuth: PersistedServerAuth | null = null

function authPath(): string {
  return join(getTeralexiAccountsDir(), AUTH_FILE)
}

function normalizeApiBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function readDiskAuth(): PersistedServerAuth | null {
  const path = authPath()
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8').trim()
    if (!raw) {
      unlinkSync(path)
      return null
    }
    const parsed = JSON.parse(raw) as PersistedServerAuth
    if (!parsed?.accessToken || !parsed.apiBaseUrl || !parsed.expiresAtMs) {
      return null
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken:
        typeof parsed.refreshToken === 'string' && parsed.refreshToken.trim()
          ? parsed.refreshToken.trim()
          : undefined,
      expiresAtMs: parsed.expiresAtMs,
      refreshExpiresAtMs:
        typeof parsed.refreshExpiresAtMs === 'number' &&
        Number.isFinite(parsed.refreshExpiresAtMs)
          ? parsed.refreshExpiresAtMs
          : undefined,
      apiBaseUrl: parsed.apiBaseUrl,
    }
  } catch (err) {
    log.warn('Failed to read persisted server auth; removing corrupt file', { err })
    try {
      unlinkSync(path)
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeDiskAuth(record: PersistedServerAuth | null): void {
  mkdirSync(getTeralexiAccountsDir(), { recursive: true })
  const path = authPath()
  if (!record) {
    if (existsSync(path)) unlinkSync(path)
    return
  }
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
}

export function loadPersistedServerAuth(): PersistedServerAuth | null {
  if (memoryAuth) return memoryAuth
  memoryAuth = readDiskAuth()
  return memoryAuth
}

function recordMatchesApiBase(
  record: PersistedServerAuth,
  apiBaseUrl: string,
): boolean {
  return normalizeApiBase(record.apiBaseUrl) === normalizeApiBase(apiBaseUrl)
}

export function getPersistedServerAccessToken(apiBaseUrl: string): string | null {
  const record = loadPersistedServerAuth()
  if (!record) return null
  if (!recordMatchesApiBase(record, apiBaseUrl)) {
    return null
  }
  if (Date.now() >= record.expiresAtMs - 60_000) {
    return null
  }
  return record.accessToken
}

/** Refresh token is usable even when the access JWT is soft-expired. */
export function getPersistedServerRefreshToken(apiBaseUrl: string): string | null {
  const record = loadPersistedServerAuth()
  if (!record?.refreshToken) return null
  if (!recordMatchesApiBase(record, apiBaseUrl)) {
    return null
  }
  if (
    typeof record.refreshExpiresAtMs === 'number' &&
    Date.now() >= record.refreshExpiresAtMs - 60_000
  ) {
    return null
  }
  return record.refreshToken
}

export function savePersistedServerAuth(args: {
  apiBaseUrl: string
  accessToken: string
  expiresAtMs: number
  refreshToken?: string
  refreshExpiresAtMs?: number
}): void {
  const previous = loadPersistedServerAuth()
  const sameBase =
    previous && recordMatchesApiBase(previous, args.apiBaseUrl) ? previous : null
  const refreshToken =
    args.refreshToken?.trim() ||
    (sameBase?.refreshToken ? sameBase.refreshToken : undefined)
  const refreshExpiresAtMs =
    args.refreshExpiresAtMs ??
    (args.refreshToken?.trim() ? undefined : sameBase?.refreshExpiresAtMs)

  memoryAuth = {
    apiBaseUrl: normalizeApiBase(args.apiBaseUrl),
    accessToken: args.accessToken,
    expiresAtMs: args.expiresAtMs,
    refreshToken,
    refreshExpiresAtMs,
  }
  writeDiskAuth(memoryAuth)
}

export function clearPersistedServerAuth(): void {
  memoryAuth = null
  writeDiskAuth(null)
}

export function resetServerAuthStoreForTests(): void {
  memoryAuth = null
}
