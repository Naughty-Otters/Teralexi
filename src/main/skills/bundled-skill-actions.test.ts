import { describe, expect, it } from 'vitest'
import {
  getBundledSkillActionTools,
  verifyBundledSkillActions,
} from './bundled-skill-actions'

describe('bundled-skill-actions', () => {
  it('returns all action tools for a bundled skill', () => {
    const tools = getBundledSkillActionTools('website')
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'render_website',
      'validate_website',
    ])
  })

  it('filters tools to declared names when provided', () => {
    const tools = getBundledSkillActionTools('website', ['validate_website'])
    expect(tools.map((tool) => tool.name)).toEqual(['validate_website'])
  })

  it('returns an empty list for skills without bundled actions', () => {
    expect(getBundledSkillActionTools('coding')).toEqual([])
    expect(getBundledSkillActionTools('unknown-skill')).toEqual([])
  })

  it('verifyBundledSkillActions passes for shipped skills', () => {
    expect(() => verifyBundledSkillActions()).not.toThrow()
  })
})
