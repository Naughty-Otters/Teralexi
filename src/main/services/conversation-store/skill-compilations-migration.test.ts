import { describe, expect, it, vi } from 'vitest'

const exec = vi.fn()

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
    ]
  }
  if (cmd.startsWith('table_info(schedulers)')) {
    return [
      { name: 'agent_id' },
      { name: 'conversation_id' },
      { name: 'prompt' },
    ]
  }
  return []
}

vi.mock('better-sqlite3', () => ({
  default: class MockDatabase {
    exec = exec
    pragma = vi.fn(pragmaImpl)
    prepare = vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    }))
    constructor(_path: string) {}
  },
}))

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeDbPath: () => '/mock/openfde.db',
  getopenfdeWorkspacePath: () => '/mock/workspace',
  ensureParentDirForFile: vi.fn(),
}))

import { ConversationStore } from './store'

describe('skill_compilations migration', () => {
  it('creates skill_compilations table on store init', () => {
    new ConversationStore()
    const sql = exec.mock.calls.map((c) => String(c[0])).join('\n')
    expect(sql).toContain('skill_compilations')
    expect(sql).toContain('source_fingerprint')
  })
})
