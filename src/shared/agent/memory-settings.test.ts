import { describe, expect, it } from 'vitest'
import { MEMORY_RETENTION_PROP_KEYS } from './memory-retention'
import { DEFAULT_MEMORY_SETTINGS, parseMemorySettings } from './memory-settings'

describe('parseMemorySettings', () => {
  it('parses recording and retention together', () => {
    expect(
      parseMemorySettings({
        'memory.recording.block': 'true',
        'memory.recording.vector': 'true',
        'memory.recording.session': 'false',
        'memory.recording.persona': 'true',
        [MEMORY_RETENTION_PROP_KEYS.blocksPerAgent]: '12',
        [MEMORY_RETENTION_PROP_KEYS.sessionsPerAgent]: '8',
        [MEMORY_RETENTION_PROP_KEYS.sessionsForAgentPersona]: '6',
      }),
    ).toEqual({
      recording: {
        block: true,
        vector: true,
        session: false,
        persona: true,
      },
      retention: {
        blocksPerAgent: 12,
        sessionsPerAgent: 8,
        sessionsForAgentPersona: 6,
      },
    })
  })

  it('uses defaults when empty', () => {
    expect(parseMemorySettings({})).toEqual(DEFAULT_MEMORY_SETTINGS)
  })
})
