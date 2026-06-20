import { describe, expect, it } from 'vitest'

// URL parsing is exercised via installSkillFromGithub integration; keep a lightweight guard.
describe('install-skill-from-github', () => {
  it('module exports installSkillFromGithub', async () => {
    const mod = await import('./install-skill-from-github')
    expect(typeof mod.installSkillFromGithub).toBe('function')
  })
})
