import { describe, expect, it } from 'vitest'
import {
  MEMORY_RECORDING_PROP_KEYS_LEGACY,
  parseMemoryRecordingSettings as parseMemoryRecordingSettingsCompat,
} from './memory-recording'
import {
  DEFAULT_MEMORY_RECORDING_SETTINGS,
  LEGACY_MEMORY_VECTOR_WRITE_KEY,
  MEMORY_RECORDING_PROP_KEYS,
  memoryRecordingFlagToString,
  parseMemoryRecordingFlag,
  parseMemoryRecordingSettings,
} from './memory-settings'

describe('parseMemoryRecordingFlag', () => {
  it('defaults to true when unset or empty', () => {
    expect(parseMemoryRecordingFlag(undefined)).toBe(true)
    expect(parseMemoryRecordingFlag('')).toBe(true)
  })

  it('returns false for explicit false-like values', () => {
    expect(parseMemoryRecordingFlag('false')).toBe(false)
    expect(parseMemoryRecordingFlag(' FALSE ')).toBe(false)
    expect(parseMemoryRecordingFlag('0')).toBe(false)
    expect(parseMemoryRecordingFlag('no')).toBe(false)
  })

  it('returns true for other truthy strings', () => {
    expect(parseMemoryRecordingFlag('true')).toBe(true)
    expect(parseMemoryRecordingFlag('yes')).toBe(true)
    expect(parseMemoryRecordingFlag('1')).toBe(true)
  })
})

describe('memoryRecordingFlagToString', () => {
  it('serializes booleans', () => {
    expect(memoryRecordingFlagToString(true)).toBe('true')
    expect(memoryRecordingFlagToString(false)).toBe('false')
  })
})

describe('parseMemoryRecordingSettings', () => {
  it('parses all layers from property keys', () => {
    const settings = parseMemoryRecordingSettings({
      [MEMORY_RECORDING_PROP_KEYS.block]: 'false',
      [MEMORY_RECORDING_PROP_KEYS.session]: '0',
      [MEMORY_RECORDING_PROP_KEYS.persona]: 'true',
      [MEMORY_RECORDING_PROP_KEYS.vector]: 'no',
    })
    expect(settings).toEqual({
      block: false,
      session: false,
      persona: true,
      vector: false,
    })
  })

  it('uses defaults when keys missing', () => {
    expect(parseMemoryRecordingSettings({})).toEqual(
      DEFAULT_MEMORY_RECORDING_SETTINGS,
    )
  })

  it('defaults vector to false when key is unset', () => {
    expect(
      parseMemoryRecordingSettings({
        [MEMORY_RECORDING_PROP_KEYS.block]: 'true',
      }).vector,
    ).toBe(false)
  })

  it('reads legacy memory.vector.writeEnabled when vector key is absent', () => {
    expect(
      parseMemoryRecordingSettings({
        [LEGACY_MEMORY_VECTOR_WRITE_KEY]: 'true',
      }).vector,
    ).toBe(true)
  })

  it('keeps deprecated compatibility exports wired to memory settings', () => {
    expect(MEMORY_RECORDING_PROP_KEYS_LEGACY.vectorWrite).toBe(
      LEGACY_MEMORY_VECTOR_WRITE_KEY,
    )
    expect(
      parseMemoryRecordingSettingsCompat({
        [MEMORY_RECORDING_PROP_KEYS.vector]: 'false',
      }),
    ).toEqual({
      ...DEFAULT_MEMORY_RECORDING_SETTINGS,
      vector: false,
    })
  })
})
