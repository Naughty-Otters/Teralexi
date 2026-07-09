import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTeralexiAccountsDir } from '@config/teralexi-home'
import { createLogger } from '@main/logger'

const log = createLogger('services.server-auth-store')

const AUTH_FILE = 'server-auth.json'

export type PersistedServerAuth = {
  accessToken: string
  expiresAtMs: number
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
    return parsed
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

export function getPersistedServerAccessToken(apiBaseUrl: string): string | null {
  const record = loadPersistedServerAuth()
  if (!record) return null
  if (normalizeApiBase(record.apiBaseUrl) !== normalizeApiBase(apiBaseUrl)) {
    return null
  }
  if (Date.now() >= record.expiresAtMs - 60_000) {
    return null
  }
  return record.accessToken
}

export function savePersistedServerAuth(args: {
  apiBaseUrl: string
  accessToken: string
  expiresAtMs: number
}): void {
  memoryAuth = {
    apiBaseUrl: normalizeApiBase(args.apiBaseUrl),
    accessToken: args.accessToken,
    expiresAtMs: args.expiresAtMs,
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
