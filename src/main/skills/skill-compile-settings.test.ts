import { describe, expect, it, vi } from 'vitest'
import { loadSkillCompileSettings, SKILL_COMPILE_PROP_KEYS } from './skill-compile-settings'

vi.mock('@config/system-prop', () => ({
  getSystemPropValues: vi.fn(() => ({})),
}))

describe('loadSkillCompileSettings', () => {
  it('loads compile settings from system props', () => {
    expect(SKILL_COMPILE_PROP_KEYS).toBeDefined()
    expect(loadSkillCompileSettings()).toEqual({ perSkill: {} })
  })
})
