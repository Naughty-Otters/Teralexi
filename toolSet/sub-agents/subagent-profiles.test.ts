import { describe, expect, it } from 'vitest'
import {
  SUBAGENT_PROFILES,
  resolveSubagentProfile,
} from './subagent-profiles'

describe('subagent-profiles', () => {
  it('defines explore, architect, and coder profiles', () => {
    expect(Object.keys(SUBAGENT_PROFILES).sort()).toEqual([
      'architect',
      'coder',
      'explore',
    ])
    expect(SUBAGENT_PROFILES.explore.agentId).toBe('skill:coding')
    expect(SUBAGENT_PROFILES.coder.allowedTools).toBe('all')
  })

  it('restricts explore profile to read-only tools', () => {
    const tools = SUBAGENT_PROFILES.explore.allowedTools
    expect(Array.isArray(tools)).toBe(true)
    if (Array.isArray(tools)) {
      expect(tools).toContain('read_file')
      expect(tools).toContain('git_diff')
      expect(tools).not.toContain('write_file')
    }
  })

  it('adds todo tools for architect profile', () => {
    const exploreTools = SUBAGENT_PROFILES.explore.allowedTools
    const architectTools = SUBAGENT_PROFILES.architect.allowedTools
    expect(Array.isArray(exploreTools)).toBe(true)
    expect(Array.isArray(architectTools)).toBe(true)
    if (Array.isArray(exploreTools) && Array.isArray(architectTools)) {
      expect(architectTools).toEqual(
        expect.arrayContaining([...exploreTools, 'read_todos', 'update_todos']),
      )
    }
  })

  it('resolves profile types including legacy plan alias', () => {
    expect(resolveSubagentProfile('explore')?.label).toBe('Explore')
    expect(resolveSubagentProfile('plan')?.type).toBe('architect')
    expect(resolveSubagentProfile('coder')?.taskPrefix).toContain('Implement')
    expect(resolveSubagentProfile('unknown')).toBeNull()
  })
})
