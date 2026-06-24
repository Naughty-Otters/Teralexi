import { describe, expect, it } from 'vitest'
import { installSkillFromGithub } from './install-skill-from-github'

describe('install-skill-from-github', () => {
  it('module exports installSkillFromGithub', () => {
    expect(typeof installSkillFromGithub).toBe('function')
  })
})
