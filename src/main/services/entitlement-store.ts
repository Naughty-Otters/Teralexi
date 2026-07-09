import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTeralexiAccountsDir } from '@config/teralexi-home'
import type {
  EntitlementCache,
  EntitlementUiSnapshot,
  EntitlementVerifyState,
  VerifiedEntitlementClaims,
} from '@shared/subscription/entitlement-types'
import { createLogger } from '@main/logger'

const log = createLogger('services.entitlement-store')

const CACHE_FILE = 'entitlement-cache.json'

let memoryCache: EntitlementCache | null = null

function cachePath(): string {
  return join(getTeralexiAccountsDir(), CACHE_FILE)
}

function readDiskCache(): EntitlementCache | null {
  const path = cachePath()
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8').trim()
    if (!raw) {
      unlinkSync(path)
      return null
    }
    const parsed = JSON.parse(raw) as EntitlementCache
    if (!parsed?.entitlementToken || !parsed.teralexiUserId) return null
    return parsed
  } catch (err) {
    log.warn('Failed to read entitlement cache; removing corrupt file', {
      err,
      path,
    })
    try {
      unlinkSync(path)
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeDiskCache(cache: EntitlementCache | null): void {
  const dir = getTeralexiAccountsDir()
  mkdirSync(dir, { recursive: true })
  const path = cachePath()
  if (!cache) {
    if (existsSync(path)) unlinkSync(path)
    return
  }
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
}

export function loadEntitlementCache(): EntitlementCache | null {
  if (memoryCache) return memoryCache
  memoryCache = readDiskCache()
  return memoryCache
}

export function getEntitlementCache(): EntitlementCache | null {
  return memoryCache ?? loadEntitlementCache()
}

export function saveEntitlementCache(cache: EntitlementCache): void {
  memoryCache = cache
  writeDiskCache(cache)
}

export function clearEntitlementCache(): void {
  memoryCache = null
  writeDiskCache(null)
}

export function buildEntitlementCache(args: {
  entitlementToken: string
  teralexiUserId: string
  claims: VerifiedEntitlementClaims
  serverTime?: string
}): EntitlementCache {
  const fetchedAt = new Date().toISOString()
  return {
    plan: args.claims.plan,
    planName: args.claims.planName,
    status: args.claims.status,
    features: args.claims.features,
    limits: args.claims.limits,
    revision: args.claims.revision,
    entitlementToken: args.entitlementToken,
    teralexiUserId: args.teralexiUserId,
    fetchedAt,
    serverTime: args.serverTime ?? fetchedAt,
    expiresAt: args.claims.expiresAt.toISOString(),
  }
}

export function toEntitlementUiSnapshot(
  cache: EntitlementCache | null,
  verifyState: EntitlementVerifyState,
): EntitlementUiSnapshot | null {
  if (!cache) return null
  return {
    plan: cache.plan,
    planName: cache.planName,
    status: cache.status,
    features: cache.features,
    revision: cache.revision,
    fetchedAt: cache.fetchedAt,
    expiresAt: cache.expiresAt,
    verifyState,
  }
}

export function hasEntitlementFeatureInCache(feature: string): boolean {
  const cache = getEntitlementCache()
  if (!cache) return false
  return cache.features.includes(feature)
}

export function resetEntitlementStoreForTests(): void {
  memoryCache = null
}
