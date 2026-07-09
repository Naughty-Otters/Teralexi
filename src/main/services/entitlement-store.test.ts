import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const accountsDir = join(process.cwd(), '.tmp-entitlement-store-test')

vi.mock('@config/teralexi-home', () => ({
  getTeralexiAccountsDir: () => accountsDir,
}))

import {
  clearEntitlementCache,
  getEntitlementCache,
  loadEntitlementCache,
  resetEntitlementStoreForTests,
  saveEntitlementCache,
} from './entitlement-store'

const sampleCache = {
  plan: 'base',
  planName: 'Base',
  status: 'active',
  features: ['metrics.write'],
  limits: {},
  revision: 1,
  entitlementToken: 'token',
  teralexiUserId: '42',
  fetchedAt: new Date().toISOString(),
  serverTime: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
}

describe('entitlement-store', () => {
  beforeEach(() => {
    resetEntitlementStoreForTests()
    mkdirSync(accountsDir, { recursive: true })
  })

  afterEach(() => {
    resetEntitlementStoreForTests()
    rmSync(accountsDir, { recursive: true, force: true })
  })

  it('deletes cache file on clear instead of writing empty content', () => {
    saveEntitlementCache(sampleCache)
    const cachePath = join(accountsDir, 'entitlement-cache.json')
    expect(existsSync(cachePath)).toBe(true)

    clearEntitlementCache()

    expect(existsSync(cachePath)).toBe(false)
    expect(getEntitlementCache()).toBeNull()
  })

  it('treats an empty cache file as missing and removes it', () => {
    const cachePath = join(accountsDir, 'entitlement-cache.json')
    writeFileSync(cachePath, '', 'utf8')

    expect(loadEntitlementCache()).toBeNull()
    expect(existsSync(cachePath)).toBe(false)
  })

  it('removes corrupt cache files without leaving stale content', () => {
    const cachePath = join(accountsDir, 'entitlement-cache.json')
    writeFileSync(cachePath, '{not-json', 'utf8')

    expect(loadEntitlementCache()).toBeNull()
    expect(existsSync(cachePath)).toBe(false)
  })

  it('round-trips a valid cache file', () => {
    saveEntitlementCache(sampleCache)
    resetEntitlementStoreForTests()

    const loaded = loadEntitlementCache()
    expect(loaded?.entitlementToken).toBe('token')
    expect(readFileSync(join(accountsDir, 'entitlement-cache.json'), 'utf8')).toContain(
      '"plan": "base"',
    )
  })
})
