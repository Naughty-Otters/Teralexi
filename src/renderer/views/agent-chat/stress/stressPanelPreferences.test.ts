import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  loadStressPanelSettings,
  saveStressPanelSettings,
} from './stressPanelPreferences'

describe('stressPanelPreferences', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when nothing is saved', () => {
    expect(loadStressPanelSettings()).toBeNull()
  })

  it('round-trips settings and keeps skill order', () => {
    saveStressPanelSettings({
      selectedScenarios: ['website', 'default', 'coding'],
      durationPreset: '30m',
      customDuration: '12m',
      inputMode: 'cycle',
      concurrencyMode: 'concurrent',
    })
    expect(loadStressPanelSettings()).toEqual({
      selectedScenarios: ['default', 'coding', 'website'],
      durationPreset: '30m',
      customDuration: '12m',
      inputMode: 'cycle',
      concurrencyMode: 'concurrent',
    })
  })

  it('drops unknown skills and invalid fields', () => {
    store.set(
      'teralexi.stress.panelSettings',
      JSON.stringify({
        selectedScenarios: ['default', 'not-a-skill', 'research'],
        durationPreset: 'nope',
        customDuration: '',
        inputMode: 'whatever',
        concurrencyMode: 'nope',
      }),
    )
    expect(loadStressPanelSettings()).toEqual({
      selectedScenarios: ['default', 'research'],
      durationPreset: '2m',
      customDuration: '15m',
      inputMode: 'hybrid',
      concurrencyMode: 'sequential',
    })
  })
})
