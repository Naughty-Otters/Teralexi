import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEMORY_RETENTION,
  parseMemoryRetentionSettings,
} from './memory-retention'

describe('memory-retention', () => {
  it('uses defaults when props unset', () => {
    expect(parseMemoryRetentionSettings({})).toEqual(DEFAULT_MEMORY_RETENTION)
  })

  it('parses custom retention counts', () => {
    expect(
      parseMemoryRetentionSettings({
        'memory.retention.blocksPerAgent': '10',
        'memory.retention.sessionsPerAgent': '3',
        'memory.retention.sessionsForAgentPersona': '4',
      }),
    ).toEqual({
      blocksPerAgent: 10,
      sessionsPerAgent: 3,
      sessionsForAgentPersona: 4,
    })
  })

  it('accepts legacy conversationsForAgentPersona key', () => {
    expect(
      parseMemoryRetentionSettings({
        'memory.retention.conversationsForAgentPersona': '4',
      }).sessionsForAgentPersona,
    ).toBe(4)
  })
})
