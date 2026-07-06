import { describe, expect, it, vi } from 'vitest'

vi.mock('./skill-path', () => ({
  resolveUserSkillsDirectory: vi.fn(() => '/mock/.teralexi/skills'),
}))

vi.mock('./skill-markdown', () => ({
  parseSkillMarkdown: vi.fn(),
}))

vi.mock('./skill-serializer', () => ({
  skillToAgent: vi.fn(),
}))

import { getSkillsDir, runAgent } from './skills'
import { resolveUserSkillsDirectory } from './skill-path'

describe('skills entry', () => {
  it('getSkillsDir returns user skills directory', () => {
    expect(getSkillsDir()).toBe('/mock/.teralexi/skills')
    expect(resolveUserSkillsDirectory).toHaveBeenCalled()
  })

  it('re-exports runAgent', async () => {
    expect(await runAgent([], {})).toBeNull()
  })
})
