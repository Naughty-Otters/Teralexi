import { describe, expect, it } from 'vitest'
import {
  SIGNED_IN_ONLY_SETTINGS_TABS,
  isSignedInOnlySettingsTab,
} from './signed-in-features'

describe('signed-in-features', () => {
  it('lists settings tabs that require sign-in', () => {
    expect(SIGNED_IN_ONLY_SETTINGS_TABS).toEqual([
      'skills',
      'agents',
      'channels',
      'scheduler',
      'memory',
      'chat',
      'mcp',
      'developer',
    ])
  })

  it('recognizes signed-in-only tabs', () => {
    for (const tab of SIGNED_IN_ONLY_SETTINGS_TABS) {
      expect(isSignedInOnlySettingsTab(tab)).toBe(true)
    }
  })

  it('rejects tabs that are available without sign-in', () => {
    expect(isSignedInOnlySettingsTab('general')).toBe(false)
    expect(isSignedInOnlySettingsTab('about')).toBe(false)
    expect(isSignedInOnlySettingsTab('')).toBe(false)
  })
})
