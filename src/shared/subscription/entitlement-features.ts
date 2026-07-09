import type { EntitlementCache, EntitlementUiSnapshot } from './entitlement-types'

export function hasEntitlementFeature(
  snapshot: Pick<EntitlementUiSnapshot, 'features' | 'verifyState'> | null,
  feature: string,
): boolean {
  if (!snapshot) return false
  if (snapshot.verifyState === 'failed' || snapshot.verifyState === 'unsigned') {
    return false
  }
  return snapshot.features.includes(feature)
}

export function hasCachedEntitlementFeature(
  cache: Pick<EntitlementCache, 'features'> | null,
  feature: string,
): boolean {
  if (!cache) return false
  return cache.features.includes(feature)
}
