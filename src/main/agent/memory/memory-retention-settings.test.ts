import { describe, expect, it, vi } from 'vitest'
import { loadMemoryRetentionSettings } from '@main/agent/memory/memory-retention-settings'

vi.mock('@config/system-prop', () => ({
  getSystemPropValues: vi.fn(() => ({
    'memory.retention.blocksPerAgent': '12',
    'memory.retention.sessionsPerAgent': '8',
    'memory.retention.sessionsForAgentPersona': '6',
  })),
}))

describe('loadMemoryRetentionSettings', () => {
  it('loads and parses retention system properties', () => {
    expect(loadMemoryRetentionSettings()).toEqual({
      blocksPerAgent: 12,
      sessionsPerAgent: 8,
      sessionsForAgentPersona: 6,
    })
  })
})
