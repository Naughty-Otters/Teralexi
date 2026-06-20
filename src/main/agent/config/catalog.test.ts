import { describe, expect, it, vi, beforeEach } from 'vitest'

const upsertAgentConfiguration = vi.fn()
const listAgentConfigurations = vi.fn(() => [
  {
    agentId: 'custom-1',
    userId: 'u',
    name: 'Custom',
    description: '',
    model: 'gpt',
    provider: 'openai',
    color: 'primary',
    enabled: true,
    systemPrompt: 'sys',
    skillsPrompt: '',
    availableSet: [],
    availableSetTouched: false,
    toolNeedsApprovalOverrides: {},
    availableMcpServers: null,
    toolLoopMaxIterations: 40,
    allowAsSubAgent: true,
    allowSubAgents: false,
    subAgentIds: null,
    createdAt: '',
    updatedAt: '',
  },
])

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    upsertAgentConfiguration,
    listAgentConfigurations,
  })),
}))

vi.mock('@main/skills/skills', () => ({
  loadSkills: vi.fn(async () => [
    {
      id: 'demo',
      folder: '/skills/demo',
      properties: {
        name: 'Demo',
        description: '',
        model: 'llama',
        provider: 'ollama',
        color: 'primary',
        enabled: true,
      },
      sections: {
        fullMarkdown: 'Skill instructions',
        instructions: 'Skill instructions',
        summary: 'Summary from file',
        report: 'Report from file',
        examples: [],
        tools: [],
      },
      systemPrompt: 'Skill instructions',
      tools: [],
    },
  ]),
  skillToAgent: vi.fn(
    (skill: {
      id: string
      properties: { name: string; model: string }
      sections: { fullMarkdown: string; instructions: string }
      systemPrompt: string
    }) => ({
      id: `skill:${skill.id}`,
      name: skill.properties.name,
      description: '',
      model: skill.properties.model,
      systemPrompt: skill.systemPrompt,
      color: 'primary' as const,
      enabled: true,
      provider: 'ollama' as const,
      isSkill: true as const,
      skillId: skill.id,
      skillsPrompt:
        skill.sections.fullMarkdown.trim() || skill.sections.instructions,
      executionSteps: {
        skills:
          skill.sections.fullMarkdown.trim() || skill.sections.instructions,
        toolLoop: {
          tools: [{ name: 'read_file', description: 'Read a file' }],
          maxIterations: 40,
        },
      },
    }),
  ),
}))

import { loadEngineAgents } from '@main/agent/config'
import { appCache } from '@main/cache/app-cache'

describe('loadEngineAgents', () => {
  beforeEach(() => {
    appCache.invalidateAllAgents()
    upsertAgentConfiguration.mockClear()
    listAgentConfigurations.mockImplementation(() => [
      {
        agentId: 'skill:demo',
        userId: 'default',
        name: 'Demo',
        description: '',
        model: 'llama',
        provider: 'ollama',
        color: 'primary',
        enabled: true,
        systemPrompt: 'Skill instructions',
        skillsPrompt: '',
        availableSet: [],
        availableSetTouched: false,
        toolNeedsApprovalOverrides: {},
        availableMcpServers: null,
        toolLoopMaxIterations: 5,
        allowAsSubAgent: true,
        allowSubAgents: true,
        subAgentIds: ['skill:other'],
        createdAt: '',
        updatedAt: '',
      },
      {
        agentId: 'custom-1',
        userId: 'u',
        name: 'Custom',
        description: '',
        model: 'gpt',
        provider: 'openai',
        color: 'primary',
        enabled: true,
        systemPrompt: 'sys',
        skillsPrompt: '',
        availableSet: [],
        availableSetTouched: false,
        toolNeedsApprovalOverrides: {},
        availableMcpServers: null,
        toolLoopMaxIterations: 40,
        allowAsSubAgent: false,
        allowSubAgents: false,
        subAgentIds: null,
        createdAt: '',
        updatedAt: '',
      },
    ])
  })

  it('merges skills and custom stored agents', async () => {
    const agents = await loadEngineAgents('default')
    expect(agents.some((a) => a.id === 'skill:demo')).toBe(true)
    expect(agents.some((a) => a.id === 'custom-1')).toBe(true)
    const skill = agents.find((a) => a.skillId === 'demo')
    expect(skill?.isSkill).toBe(true)
    expect(skill?.skillsPrompt).toBe('Skill instructions')
  })

  it('seeds DB row on first load without copying markdown prompts', async () => {
    listAgentConfigurations.mockImplementation(() => [])
    await loadEngineAgents('default')
    expect(upsertAgentConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'skill:demo',
        skillsPrompt: '',
        allowAsSubAgent: true,
        allowSubAgents: true,
        subAgentIds: null,
      }),
    )
  })

  it('prefers saved skillsPrompt over disk when non-empty', async () => {
    listAgentConfigurations.mockImplementation(() => [
      {
        agentId: 'skill:demo',
        userId: 'default',
        name: 'Demo',
        description: '',
        model: 'llama',
        provider: 'ollama',
        color: 'primary',
        enabled: true,
        systemPrompt: 'Saved system',
        skillsPrompt: 'Saved skills',
        availableSet: [],
        availableSetTouched: false,
        toolNeedsApprovalOverrides: {},
        availableMcpServers: null,
        toolLoopMaxIterations: 5,
        allowAsSubAgent: true,
        allowSubAgents: false,
        subAgentIds: null,
        createdAt: '',
        updatedAt: '',
      },
    ])
    upsertAgentConfiguration.mockClear()
    const agents = await loadEngineAgents('default')
    expect(agents.find((a) => a.id === 'skill:demo')?.skillsPrompt).toBe(
      'Saved skills',
    )
    expect(upsertAgentConfiguration).not.toHaveBeenCalled()
  })

  it('applies allowSubAgents and subAgentIds to executionSteps.toolLoop from stored config', async () => {
    const agents = await loadEngineAgents('default')
    const skill = agents.find((a) => a.id === 'skill:demo')
    expect(skill?.allowSubAgents).toBe(true)
    expect(skill?.subAgentIds).toEqual(['skill:other'])
    expect(skill?.executionSteps?.toolLoop?.allowSubAgents).toBe(true)
    expect(skill?.executionSteps?.toolLoop?.subAgentIds).toEqual(['skill:other'])
  })
})
