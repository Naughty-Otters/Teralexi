import { beforeEach, describe, expect, it, vi } from 'vitest'

const run = vi.fn()
const prepare = vi.fn()

function pragmaImpl(cmd: string): unknown {
  if (cmd.startsWith('table_info(messages)')) {
    return [{ name: 'conversation_id' }]
  }
  if (cmd.startsWith('table_info(agent_configurations)')) {
    return [
      { name: 'available_set_json' },
      { name: 'available_set_touched' },
      { name: 'available_mcp_servers_json' },
      { name: 'tool_needs_approval_overrides_json' },
      { name: 'tool_loop_max_iterations' },
      { name: 'allow_as_sub_agent' },
      { name: 'allow_sub_agents' },
      { name: 'sub_agent_ids_json' },
    ]
  }
  if (cmd.startsWith('table_info(schedulers)')) {
    return [
      { name: 'agent_id' },
      { name: 'conversation_id' },
      { name: 'prompt' },
    ]
  }
  if (cmd.startsWith('table_info(tool_results)')) {
    return [
      { name: 'id' },
      { name: 'conversation_id' },
      { name: 'tool_name' },
    ]
  }
  // Unknown tables — return empty array so tableHasColumn() safely returns false
  return []
}

vi.mock('better-sqlite3', () => ({
  default: class MockDatabase {
    pragma = vi.fn(pragmaImpl)
    exec = vi.fn()
    prepare = prepare
    constructor(_path: string) {}
  },
}))

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeDbPath: vi.fn(() => '/mock/openfde.db'),
  getopenfdeWorkspacePath: vi.fn(() => '/mock/workspace'),
  ensureParentDirForFile: vi.fn(),
}))

import { getConversationStore } from './conversation-store'

describe('ConversationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prepare.mockImplementation((sql: string) => {
      if (sql.includes('sqlite_master')) {
        return { get: () => ({ sql: '' }), run, all: vi.fn(() => []) }
      }
      return {
        run,
        get: vi.fn(() => null),
        all: vi.fn(() => []),
      }
    })
  })

  it('singleton returns same instance', () => {
    expect(getConversationStore()).toBe(getConversationStore())
  })

  it('createConversation inserts row', () => {
    const store = getConversationStore()
    store.createConversation({
      id: 'c1',
      agentId: 'a1',
      title: 'Chat',
      createdAt: 't',
      updatedAt: 't',
    })
    expect(prepare).toHaveBeenCalled()
    expect(run).toHaveBeenCalled()
  })

  it('getConversation returns null when missing', () => {
    const store = getConversationStore()
    expect(store.getConversation('missing')).toBeNull()
  })
})
