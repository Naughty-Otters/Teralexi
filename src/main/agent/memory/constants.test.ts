import { describe, expect, it } from 'vitest'
import {
  AGENT_MEMORY_PERSONA_SNAPSHOT_FILE,
  MEMORY_ABSTRACTOR_MESSAGE_CHAR_LIMIT,
  MEMORY_ROOT_RESERVED_DIR_NAMES,
} from '@main/agent/memory/constants'

describe('memory constants', () => {
  it('defines persona snapshot filename', () => {
    expect(AGENT_MEMORY_PERSONA_SNAPSHOT_FILE).toBe('profile.json')
  })

  it('reserves users directory', () => {
    expect(MEMORY_ROOT_RESERVED_DIR_NAMES.has('users')).toBe(true)
  })

  it('sets abstractor limits', () => {
    expect(MEMORY_ABSTRACTOR_MESSAGE_CHAR_LIMIT).toBeGreaterThan(0)
  })
})
