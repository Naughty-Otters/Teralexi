import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./clawhub-client', () => ({
  getClawHubClient: vi.fn(),
}))

vi.mock('./clawhub-origin', () => ({
  listClawHubOrigins: vi.fn(() => []),
  readClawHubOrigin: vi.fn(),
  writeClawHubOrigin: vi.fn(),
}))

const deleteAgentConfiguration = vi.fn()
const deleteSkillCompilations = vi.fn()

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    deleteAgentConfiguration,
    deleteSkillCompilations,
  }),
}))

vi.mock('../skill-path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skill-path')>()
  return {
    ...actual,
    resolveUserSkillsDirectory: () => '/mock/.teralexi/skills',
    isLoadableSkillFolder: vi.fn(() => true),
  }
})

vi.mock('node:fs/promises', () => ({
  rm: vi.fn(async () => undefined),
}))

import { getClawHubClient } from './clawhub-client'
import { readClawHubOrigin } from './clawhub-origin'
import {
  searchClawHubSkills,
  getClawHubSkillDetail,
  uninstallClawHubSkill,
} from './clawhub-skill-lifecycle'
import { DEFAULT_USER_ID } from '@main/agent/config'

describe('clawhub-skill-lifecycle guards', () => {
  beforeEach(() => {
    vi.mocked(getClawHubClient).mockReset()
    deleteAgentConfiguration.mockReset()
    deleteSkillCompilations.mockReset()
  })

  it('filters workflow skills from search results', async () => {
    vi.mocked(getClawHubClient).mockReturnValue({
      searchSkills: vi.fn(async () => ({
        results: [
          { slug: 'workflow-compiler', displayName: 'W', summary: '', version: '1', updatedAt: 1 },
          { slug: 'demo', displayName: 'Demo', summary: '', version: '1', updatedAt: 1 },
        ],
      })),
    } as never)

    const result = await searchClawHubSkills({ query: 'workflow' })
    expect(result.results.map((r) => r.slug)).toEqual(['demo'])
  })

  it('blocks workflow skill inspect', async () => {
    await expect(getClawHubSkillDetail('workflow-runtime')).rejects.toThrow(
      /Workflow skills cannot be installed/,
    )
  })
})

describe('uninstallClawHubSkill', () => {
  beforeEach(() => {
    deleteAgentConfiguration.mockReset()
    deleteSkillCompilations.mockReset()
  })

  it('removes persisted agent config and compilations', async () => {
    vi.mocked(readClawHubOrigin).mockReturnValue({
      registry: 'clawhub',
      slug: 'demo',
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      localSkillId: 'demo-skill',
    })

    const result = await uninstallClawHubSkill({ localSkillId: 'demo-skill' })

    expect(result.ok).toBe(true)
    expect(deleteAgentConfiguration).toHaveBeenCalledWith(
      'skill:demo-skill',
      DEFAULT_USER_ID,
    )
    expect(deleteSkillCompilations).toHaveBeenCalledWith('demo-skill')
  })
})
