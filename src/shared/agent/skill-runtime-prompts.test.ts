import { describe, expect, it } from 'vitest'
import { buildRuntimePromptViews } from './skill-runtime-prompts'

describe('skill-runtime-prompts', () => {
  it('buildRuntimePromptViews exposes compiled step prompts', () => {
    const views = buildRuntimePromptViews({
      thinking: { instructions: 'thin router' },
      instructions: { instructions: 'skill.md body' },
      validation: { rules: ['rule a', 'rule b'] },
    })
    expect(views).toEqual({
      thinking: 'thin router',
      instructions: 'skill.md body',
      validation: '### Validation rules\n\n- rule a\n- rule b',
    })
  })

  it('returns null when compiled artifact missing', () => {
    expect(buildRuntimePromptViews(null)).toBeNull()
  })
})
