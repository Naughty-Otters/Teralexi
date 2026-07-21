import { describe, expect, it } from 'vitest'
import {
  SIGNED_IN_ONLY_SETTINGS_TABS,
  SIGNED_IN_ONLY_SKILL_IDS,
  isSignedInOnlySettingsTab,
  isSignedInOnlySkillId,
  isAgentLockedWithoutSignIn,
} from './signed-in-features'

describe('signed-in-features', () => {
  it('has no settings tabs that require sign-in', () => {
    expect(SIGNED_IN_ONLY_SETTINGS_TABS).toEqual([])
  })

  it('rejects all settings tabs', () => {
    expect(isSignedInOnlySettingsTab('skills')).toBe(false)
    expect(isSignedInOnlySettingsTab('agents')).toBe(false)
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

  it('locks website agents when signed out', () => {
    expect(
      isAgentLockedWithoutSignIn({ skillId: 'website', id: 'skill:website' }, false),
    ).toBe(true)
    expect(
      isAgentLockedWithoutSignIn({ skillId: 'website', id: 'skill:website' }, true),
    ).toBe(false)
    expect(
      isAgentLockedWithoutSignIn({ skillId: 'coding', id: 'skill:coding' }, false),
    ).toBe(false)
  })
})
