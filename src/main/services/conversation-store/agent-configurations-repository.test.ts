import { describe, expect, it } from 'vitest'
import { createMigrationTestDatabase } from './migration-test-db'
import { runMigrations } from './migrations'
import { AgentConfigurationsRepository } from './agent-configurations-repository'
import type { StoredAgentConfiguration } from './types'

function baseConfig(
  overrides: Partial<
    Omit<StoredAgentConfiguration, 'createdAt' | 'updatedAt'>
  > = {},
): Omit<StoredAgentConfiguration, 'createdAt' | 'updatedAt'> {
  return {
    agentId: 'skill:demo',
    userId: 'user-1',
    name: 'Demo',
    description: '',
    model: 'llama',
    provider: 'ollama',
    color: 'primary',
    enabled: true,
    systemPrompt: '',
    skillsPrompt: '',
    availableSet: [],
    availableSetTouched: false,
    toolNeedsApprovalOverrides: {},
    availableMcpServers: null,
    toolLoopMaxIterations: 40,
    todoMaxRetries: 3,
    allowAsSubAgent: true,
    allowSubAgents: false,
    subAgentIds: null,
    llmRoutingMode: 'unified',
    stageLlm: {},
    ...overrides,
  }
}

describe('AgentConfigurationsRepository todoMaxRetries', () => {
  it('persists and loads todoMaxRetries', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new AgentConfigurationsRepository(db)

    repo.upsert(baseConfig({ todoMaxRetries: 5 }))
    expect(repo.list('user-1')[0]?.todoMaxRetries).toBe(5)
  })
})

describe('AgentConfigurationsRepository stage LLM settings', () => {
  it('persists and loads llmRoutingMode and stageLlm overrides', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new AgentConfigurationsRepository(db)

    repo.upsert(
      baseConfig({
        llmRoutingMode: 'per_stage',
        stageLlm: {
          explore: { provider: 'anthropic', model: 'claude-sonnet' },
          toolLoop: { provider: 'openai', model: 'gpt-4o' },
        },
      }),
    )

    const loaded = repo.list('user-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.llmRoutingMode).toBe('per_stage')
    expect(loaded[0]?.stageLlm.explore).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
    })
    expect(loaded[0]?.stageLlm.toolLoop).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    })
    expect(loaded[0]?.stageLlm.verifier).toBeUndefined()
  })
})

describe('AgentConfigurationsRepository sub-agent settings', () => {
  it('persists and loads allowAsSubAgent, allowSubAgents, and subAgentIds', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new AgentConfigurationsRepository(db)

    repo.upsert(
      baseConfig({
        allowAsSubAgent: false,
        allowSubAgents: true,
        subAgentIds: ['skill:documents', 'skill:github'],
      }),
    )

    const loaded = repo.list('user-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.allowAsSubAgent).toBe(false)
    expect(loaded[0]?.allowSubAgents).toBe(true)
    expect(loaded[0]?.subAgentIds).toEqual(['skill:documents', 'skill:github'])
  })

  it('stores null subAgentIds when allow-list is empty', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new AgentConfigurationsRepository(db)

    repo.upsert(baseConfig({ allowSubAgents: true, subAgentIds: null }))
    repo.upsert(
      baseConfig({
        agentId: 'skill:other',
        allowSubAgents: true,
        subAgentIds: [],
      }),
    )

    const byId = new Map(repo.list('user-1').map((row) => [row.agentId, row]))
    expect(byId.get('skill:demo')?.subAgentIds).toBeNull()
    expect(byId.get('skill:other')?.subAgentIds).toEqual([])
  })

  it('updates sub-agent flags on conflict', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new AgentConfigurationsRepository(db)

    repo.upsert(baseConfig({ allowSubAgents: false }))
    repo.upsert(
      baseConfig({
        allowSubAgents: true,
        subAgentIds: ['custom:helper'],
      }),
    )

    const row = repo.list('user-1')[0]
    expect(row?.allowSubAgents).toBe(true)
    expect(row?.subAgentIds).toEqual(['custom:helper'])
  })
})
