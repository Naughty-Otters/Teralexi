import { describe, expect, it, vi } from 'vitest'
import { loadMemoryRecordingSettings } from '@main/agent/memory/memory-recording-settings'

vi.mock('@config/system-prop', () => ({
  getSystemPropValues: vi.fn(() => ({
    'memory.recording.block': 'false',
    'memory.recording.session': 'true',
    'memory.recording.persona': '0',
    'memory.recording.vector': 'false',
  })),
}))

describe('loadMemoryRecordingSettings', () => {
  it('loads and parses system properties', () => {
    expect(loadMemoryRecordingSettings()).toEqual({
      block: false,
      session: true,
      persona: false,
      vector: false,
    })
  })
})
