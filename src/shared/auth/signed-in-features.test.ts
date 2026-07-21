import { describe, expect, it } from 'vitest'
import {
  SIGNED_IN_ONLY_SETTINGS_TABS,
  SIGNED_IN_ONLY_SKILL_IDS,
  isSignedInOnlySettingsTab,
  isSignedInOnlySkillId,
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

  it('lists skills that require sign-in', () => {
    expect(SIGNED_IN_ONLY_SKILL_IDS).toEqual(['website'])
  })

  it('recognizes the website skill as signed-in-only', () => {
    expect(isSignedInOnlySkillId('website')).toBe(true)
    expect(isSignedInOnlySkillId(' coding ')).toBe(false)
    expect(isSignedInOnlySkillId(null)).toBe(false)
    expect(isSignedInOnlySkillId(undefined)).toBe(false)
  })
})
