import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appCache } from './app-cache'
import {
  resetStartupWarmForTests,
  scheduleDeferredAppCacheAgentWarm,
  warmAgentCache,
  warmAppCacheOnStartup,
} from './cache-warmer'

vi.mock('@main/agent/config/catalog', () => ({
  loadEngineAgentsFromDisk: vi.fn(async () => [
    { id: 'agent-a', skillId: 'skill-a' },
    { id: 'agent-b', skillId: undefined },
  ]),
}))

vi.mock('@main/agent/utils/agent-run-context', () => ({
  loadAgentRunCredentialsFromDisk: vi.fn(() => ({
    ollamaBaseURL: 'http://localhost:11434',
    llamacppBaseURL: 'http://127.0.0.1:8080/v1',
    llamacppApiKey: '',
    openaiApiKey: '',
    openaiBaseURL: 'https://api.openai.com/v1',
    geminiApiKey: '',
    deepseekApiKey: '',
    xaiApiKey: '',
    xaiBaseURL: '',
    zhipuApiKey: '',
  })),
  loadMcpToolsForAgentFromServers: vi.fn(async (_userId: string, agent: { id: string }) => [
    { name: `mcp-${agent.id}`, source: 'mcp' },
  ]),
}))

vi.mock('@main/agent/memory/memory-persona-injection', () => ({
  resolveMemoryAgentId: vi.fn((agentId?: string, skillId?: string) => agentId ?? skillId ?? null),
  buildMemoryPersonaInstructionBlockFromDisk: vi.fn(({ agentId }: { agentId?: string }) =>
    agentId ? `persona:${agentId}` : '',
  ),
}))

describe('cache-warmer', () => {
  beforeEach(() => {
    resetStartupWarmForTests()
    appCache.invalidateAllAgents()
    appCache.invalidateCredentials()
    appCache.invalidateAllMcpTools()
    appCache.invalidateAllPersona()
    vi.clearAllMocks()
  })

  it('warmAppCacheOnStartup loads base buckets and all agents', async () => {
    await warmAppCacheOnStartup('default')
    await scheduleDeferredAppCacheAgentWarm('default')

    expect(appCache.getAgents('default')).toHaveLength(2)
    expect(appCache.getCredentials()).toBeTruthy()
    expect(appCache.getMcpTools('default', 'agent-a')).toHaveLength(1)
    expect(appCache.getMcpTools('default', 'agent-b')).toHaveLength(1)
    expect(appCache.getPersona('default', 'agent-a')).toBe('persona:agent-a')
    expect(appCache.getPersona('default', 'agent-b')).toBe('persona:agent-b')
  })

  it('warmAppCacheOnStartup dedupes concurrent calls', async () => {
    const { loadEngineAgentsFromDisk } = await import('@main/agent/config/catalog')
    await Promise.all([
      warmAppCacheOnStartup('default'),
      warmAppCacheOnStartup('default'),
    ])
    expect(loadEngineAgentsFromDisk).toHaveBeenCalledTimes(1)
  })

  it('warmAgentCache warms a single agent after base buckets', async () => {
    await warmAgentCache({ userId: 'default', agentId: 'agent-a' })

    expect(appCache.getAgents('default')).toHaveLength(2)
    expect(appCache.getMcpTools('default', 'agent-a')).toHaveLength(1)
    expect(appCache.getMcpTools('default', 'agent-b')).toBeNull()
  })
})
