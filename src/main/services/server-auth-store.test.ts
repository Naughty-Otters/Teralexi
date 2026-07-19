import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const accountsDir = join(process.cwd(), '.tmp-server-auth-store-test')

vi.mock('@config/teralexi-home', () => ({
  getTeralexiAccountsDir: () => accountsDir,
}))

import {
  clearPersistedServerAuth,
  getPersistedServerAccessToken,
  getPersistedServerRefreshToken,
  resetServerAuthStoreForTests,
  savePersistedServerAuth,
} from './server-auth-store'

describe('server-auth-store', () => {
  beforeEach(() => {
    resetServerAuthStoreForTests()
    mkdirSync(accountsDir, { recursive: true })
  })

  afterEach(() => {
    resetServerAuthStoreForTests()
    rmSync(accountsDir, { recursive: true, force: true })
  })

  it('round-trips a persisted server access token', () => {
    savePersistedServerAuth({
      apiBaseUrl: 'http://localhost:8000',
      accessToken: 'server-jwt',
      expiresAtMs: Date.now() + 60 * 60_000,
    })
    resetServerAuthStoreForTests()

    expect(getPersistedServerAccessToken('http://localhost:8000/')).toBe('server-jwt')
  })

  it('persists and returns refresh_token even when access is soft-expired', () => {
    savePersistedServerAuth({
      apiBaseUrl: 'http://localhost:8000',
      accessToken: 'server-jwt',
      refreshToken: 'refresh-opaque',
      expiresAtMs: Date.now() - 1_000,
      refreshExpiresAtMs: Date.now() + 86_400_000,
    })
    resetServerAuthStoreForTests()

    expect(getPersistedServerAccessToken('http://localhost:8000')).toBeNull()
    expect(getPersistedServerRefreshToken('http://localhost:8000')).toBe(
      'refresh-opaque',
    )
  })

  it('clears persisted auth on disk', () => {
    savePersistedServerAuth({
      apiBaseUrl: 'http://localhost:8000',
      accessToken: 'server-jwt',
      refreshToken: 'refresh-opaque',
      expiresAtMs: Date.now() + 60 * 60_000,
    })
    const path = join(accountsDir, 'server-auth.json')
    expect(existsSync(path)).toBe(true)

    clearPersistedServerAuth()

    expect(existsSync(path)).toBe(false)
    expect(getPersistedServerAccessToken('http://localhost:8000')).toBeNull()
    expect(getPersistedServerRefreshToken('http://localhost:8000')).toBeNull()
  })

  it('removes empty auth files', () => {
    const path = join(accountsDir, 'server-auth.json')
    writeFileSync(path, '', 'utf8')

    expect(getPersistedServerAccessToken('http://localhost:8000')).toBeNull()
    expect(existsSync(path)).toBe(false)
  })
})
