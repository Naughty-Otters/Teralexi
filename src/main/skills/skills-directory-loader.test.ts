import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getEffectiveSkillCompilation: vi.fn(() => null),
  }),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('./skill-module-loader', () => ({
  loadSkillActions: vi.fn(async () => []),
  loadToolSetTools: vi.fn(async () => []),
}))

vi.mock('./skill-markdown', () => ({
  parseSkillMarkdown: vi.fn(),
}))

vi.mock('./skill-path', () => ({
  isLoadableSkillFolder: vi.fn(() => true),
  extractYamlFrontmatterBlock: vi.fn(() => null),
  stripYamlFrontmatter: vi.fn((s: string) => s),
  normalizeSkillFileText: vi.fn((s: string) => s),
  resolvePropertiesRaw: vi.fn(() => 'name: Demo\nmodel: llama\nprovider: ollama'),
  resolveSkillsSourceRoots: vi.fn(() => ['/bundled/skills', '/user/skills']),
  resolveUserSkillsDirectory: vi.fn(() => '/user/skills'),
}))

import { existsSync, readdirSync, readFileSync } from 'fs'
import { parseSkillMarkdown } from './skill-markdown'
import { loadSkills, loadSkillsFromDirectory } from './skills-directory-loader'
import { SKILL_FILES } from './constants'

function mockParsedSkill(id: string) {
  return {
    id,
    folder: `/skills/${id}`,
    properties: {
      name: id,
      description: '',
      model: 'llama',
      provider: 'ollama',
      color: 'primary',
      enabled: true,
    },
    sections: {
      fullMarkdown: 'Do work',
      instructions: 'Do work',
      summary: '',
      report: '',
      examples: [],
      tools: [],
    },
    systemPrompt: 'Do work',
    tools: [],
    actionToolNames: [] as string[],
  }
}

describe('loadSkillsFromDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(parseSkillMarkdown).mockImplementation((id) =>
      mockParsedSkill(String(id)) as never,
    )
  })

  it('creates directory and returns empty when missing', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const skills = await loadSkillsFromDirectory('/skills')
    expect(skills).toEqual([])
  })

  it('loads valid skill folders', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readdirSync).mockReturnValue(['demo'])
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith(SKILL_FILES.SKILL_MD)) {
        return '## Instructions\nDo work'
      }
      return ''
    })
    const skills = await loadSkillsFromDirectory('/skills')
    expect(skills).toHaveLength(1)
    expect(skills[0]?.id).toBe('demo')
  })

  it('returns empty when directory cannot be read', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error('read failed')
    })
    await expect(loadSkillsFromDirectory('/skills')).resolves.toEqual([])
  })

  it('skips invalid and failing skill folders', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readdirSync).mockReturnValue(['bad', 'throws'])
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('throws')) {
        throw new Error('io error')
      }
      return '## Instructions\nx'
    })
    vi.mocked(parseSkillMarkdown).mockReturnValue(null)
    const skills = await loadSkillsFromDirectory('/skills')
    expect(skills).toEqual([])
  })
})

describe('loadSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(parseSkillMarkdown).mockImplementation((id) =>
      mockParsedSkill(String(id)) as never,
    )
  })

  it('merges skills from bundled and user source roots', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    let dirCall = 0
    vi.mocked(readdirSync).mockImplementation(() => {
      dirCall += 1
      return dirCall === 1 ? ['bundled-skill'] : ['user-skill']
    })
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith(SKILL_FILES.SKILL_MD)) {
        return '## Instructions\nDo work'
      }
      return ''
    })
    const skills = await loadSkills()
    expect(skills).toHaveLength(2)
    expect(skills.map((s) => s.id).sort()).toEqual(['bundled-skill', 'user-skill'])
  })
})
