import { describe, expect, it } from 'vitest'
import {
  codingModeLabel,
  DEFAULT_CODING_MODE,
  EXPLORE_MODE_ALLOWED_TOOLS,
  parseCodingMode,
  parseSubagentProfileType,
} from './coding-mode'

describe('coding-mode', () => {
  it('parses known modes and defaults unknown', () => {
    expect(parseCodingMode('explore')).toBe('explore')
    expect(parseCodingMode('YOLO')).toBe('yolo')
    expect(parseCodingMode('nope')).toBe(DEFAULT_CODING_MODE)
  })

  it('maps legacy plan mode to explore', () => {
    expect(parseCodingMode('plan')).toBe('explore')
  })

  it('labels modes for UI', () => {
    expect(codingModeLabel('explore')).toBe('Exploring')
    expect(codingModeLabel('auto')).toBe('Auto')
    expect(codingModeLabel('normal')).toBe('Normal')
  })

  it('allows read-only tools in explore mode', () => {
    expect(EXPLORE_MODE_ALLOWED_TOOLS.has('read_file')).toBe(true)
    expect(EXPLORE_MODE_ALLOWED_TOOLS.has('write_file')).toBe(false)
    expect(EXPLORE_MODE_ALLOWED_TOOLS.has('dispatch_subagent')).toBe(true)
  })

  it('normalizes subagent profile types', () => {
    expect(parseSubagentProfileType('architect')).toBe('architect')
    expect(parseSubagentProfileType('plan')).toBe('architect')
    expect(parseSubagentProfileType('bash')).toBe('bash')
    expect(parseSubagentProfileType('browser')).toBe('browser')
    expect(parseSubagentProfileType('nope')).toBeNull()
  })
})
