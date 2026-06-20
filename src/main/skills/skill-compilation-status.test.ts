import { beforeEach, describe, expect, it, vi } from 'vitest'

const getEffectiveSkillCompilation = vi.fn(() => null)

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getEffectiveSkillCompilation,
  }),
}))

vi.mock('@shared/agent/skill-compile-settings', () => ({
  resolveSkillCompileLlm: () => ({
    provider: 'ollama',
    model: 'llama3.2',
    source: 'default',
  }),
}))

vi.mock('./skill-path', () => ({
  resolveLoadableSkillIds: () => ['alpha', 'beta'],
  resolveSkillCompilationSource: () => 'bundled',
  resolveSkillFolder: () => '/skills/alpha',
  resolvePropertiesRaw: () => 'name: Alpha',
  extractYamlFrontmatterBlock: () => null,
  stripYamlFrontmatter: (md: string) => md,
}))

vi.mock('./skill-compiler', () => ({
  computeSkillSourceFingerprint: () => 'fp1',
  compileSkill: vi.fn(),
}))

vi.mock('./skill-compile-settings', () => ({
  loadSkillCompileSettings: () => ({ perSkill: {} }),
}))

vi.mock('./skill-markdown', () => ({
  parseSkillMarkdown: vi.fn((id: string) => ({
    properties: {
      name: id === 'alpha' ? 'Alpha Skill' : 'Beta',
      provider: 'ollama',
      model: 'llama3.2',
    },
  })),
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '# skill'),
}))

import {
  compileAllSkills,
  listSkillCompilationStatuses,
} from './skill-compilation-status'
import { compileSkill } from './skill-compiler'

describe('skill-compilation-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEffectiveSkillCompilation.mockReturnValue(null)
  })

  it('listSkillCompilationStatuses returns sorted skills', () => {
    const items = listSkillCompilationStatuses()
    expect(items.map((i) => i.skillId)).toEqual(['alpha', 'beta'])
    expect(items[0]?.name).toBe('Alpha Skill')
  })

  it('compileAllSkills compiles each id', async () => {
    vi.mocked(compileSkill).mockResolvedValue(null)
    getEffectiveSkillCompilation.mockReturnValue({
      status: 'ready',
      errorMessage: null,
    })

    const results = await compileAllSkills({ force: true })
    expect(compileSkill).toHaveBeenCalledTimes(2)
    expect(results).toHaveLength(2)
  })
})
