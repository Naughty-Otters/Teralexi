import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSystemConfigValues = vi.hoisted(() => vi.fn())
const localStore = vi.hoisted(() => new Map<string, string>())

vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStore.set(key, value)
  },
  removeItem: (key: string) => {
    localStore.delete(key)
  },
  clear: () => {
    localStore.clear()
  },
})

vi.mock('@renderer/store/modules/agent/config', () => ({
  ONBOARDING_COMPLETED_KEY: 'settings.onboarding.completed',
  getSystemConfigValues,
}))

import {
  isOnboardingComplete,
  resetOnboardingRouteCache,
  syncOnboardingRouteMirror,
} from './onboarding-route-state'

const MIRROR_KEY = 'teralexi.onboarding.completed'

describe('onboarding-route-state', () => {
  beforeEach(() => {
    resetOnboardingRouteCache()
    getSystemConfigValues.mockReset()
    localStore.clear()
  })

  it('prefers system config over a stale localStorage mirror of complete', async () => {
    localStorage.setItem(MIRROR_KEY, '1')
    getSystemConfigValues.mockResolvedValue({
      'settings.onboarding.completed': 'false',
    })

    await expect(isOnboardingComplete()).resolves.toBe(false)
    expect(localStorage.getItem(MIRROR_KEY)).toBe('0')
  })

  it('returns true when system config marks onboarding complete', async () => {
    getSystemConfigValues.mockResolvedValue({
      'settings.onboarding.completed': 'true',
    })

    await expect(isOnboardingComplete()).resolves.toBe(true)
    expect(localStorage.getItem(MIRROR_KEY)).toBe('1')
  })

  it('falls back to localStorage mirror when config read fails', async () => {
    localStorage.setItem(MIRROR_KEY, '1')
    getSystemConfigValues.mockRejectedValue(new Error('ipc down'))

    await expect(isOnboardingComplete()).resolves.toBe(true)
  })

  it('syncOnboardingRouteMirror updates cache and mirror', async () => {
    syncOnboardingRouteMirror(true)
    getSystemConfigValues.mockResolvedValue({
      'settings.onboarding.completed': 'false',
    })
    // In-memory cache wins until reset.
    await expect(isOnboardingComplete()).resolves.toBe(true)

    resetOnboardingRouteCache()
    await expect(isOnboardingComplete()).resolves.toBe(false)
  })
})
