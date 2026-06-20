import { describe, expect, it } from 'vitest'
import {
  resolveCompiledSkillPrompts,
  resolveSkillAgentConfiguration,
  resolveSkillAgentPrompts,
  resolveSkillStepPrompt,
  skillAgentPromptsNeedSeed,
} from './skill-prompts'

describe('resolveSkillStepPrompt', () => {
  it('prefers non-empty saved prompt', () => {
    expect(
      resolveSkillStepPrompt(' Saved ', 'From skill', 'From steps'),
    ).toBe('Saved')
  })

  it('falls back to skill file when saved is empty', () => {
    expect(resolveSkillStepPrompt('', 'From skill.md', '')).toBe('From skill.md')
    expect(resolveSkillStepPrompt('  ', undefined, 'From steps')).toBe(
      'From steps',
    )
  })
})

describe('resolveSkillAgentPrompts', () => {
  const skill = {
    skillsPrompt: 'From skill.md instructions',
    executionSteps: {
      skills: 'From executionSteps skills',
    },
  }

  it('uses package files when DB fields are empty strings', () => {
    const resolved = resolveSkillAgentPrompts(skill, {
      skillsPrompt: '  ',
    })
    expect(resolved.skillsPrompt).toBe('From skill.md instructions')
  })

  it('prefers non-empty DB values over package files', () => {
    const resolved = resolveSkillAgentPrompts(skill, {
      skillsPrompt: 'Saved skills',
    })
    expect(resolved.skillsPrompt).toBe('Saved skills')
  })

  it('falls back to executionSteps skills text', () => {
    const resolved = resolveSkillAgentPrompts({
      executionSteps: { skills: 'Steps only' },
    })
    expect(resolved.skillsPrompt).toBe('Steps only')
  })
})

describe('resolveCompiledSkillPrompts', () => {
  it('uses full skill package text, not compiled distillate', () => {
    const resolved = resolveCompiledSkillPrompts(
      { skillsPrompt: 'full skill.md body', systemPrompt: 'disk sys' },
      { instructions: { instructions: 'compiled subset' } },
      { skillsPrompt: '' },
    )
    expect(resolved.skillsPrompt).toBe('full skill.md body')
    expect(resolved.systemPrompt).toBe('disk sys')
  })
})

describe('resolveSkillAgentConfiguration', () => {
  it('merges compiled artifact with saved overrides', () => {
    const resolved = resolveSkillAgentConfiguration(
      { skillsPrompt: 'disk' },
      { skillsPrompt: 'override' },
      { instructions: { instructions: 'compiled' } },
    )
    expect(resolved.skillsPrompt).toBe('override')
  })
})

describe('skillAgentPromptsNeedSeed', () => {
  it('always returns false under skill.md-only loading', () => {
    expect(skillAgentPromptsNeedSeed(undefined, { skillsPrompt: 'x' })).toBe(
      false,
    )
  })
})
