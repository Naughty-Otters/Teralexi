import { describe, expect, it } from 'vitest'
import {
  applySubAgentSettingsToExecutionSteps,
  isSubAgentTargetAllowed,
  toggleSubAgentTargetSelection,
} from './sub-agent-settings'

describe('applySubAgentSettingsToExecutionSteps', () => {
  it('sets allowSubAgents on toolLoop when delegation enabled', () => {
    const agent = {
      allowSubAgents: true,
      availableSkillTools: [{ name: 'read_file' }],
      toolLoopMaxIterations: 40,
    }
    applySubAgentSettingsToExecutionSteps(agent)
    expect(agent.executionSteps?.toolLoop?.allowSubAgents).toBe(true)
    expect(agent.executionSteps?.toolLoop?.tools).toHaveLength(1)
  })

  it('applies subAgentIds allow-list when provided', () => {
    const agent = {
      allowSubAgents: true,
      subAgentIds: ['skill:documents', 'skill:github'],
      availableSkillTools: [],
      toolLoopMaxIterations: 40,
    }
    applySubAgentSettingsToExecutionSteps(agent)
    expect(agent.executionSteps?.toolLoop?.subAgentIds).toEqual([
      'skill:documents',
      'skill:github',
    ])
  })

  it('removes delegation flags when disabled', () => {
    const agent = {
      allowSubAgents: false,
      executionSteps: {
        toolLoop: {
          tools: [{ name: 't' }],
          allowSubAgents: true,
          subAgentIds: ['skill:a'],
        },
      },
    }
    applySubAgentSettingsToExecutionSteps(agent)
    expect(agent.executionSteps?.toolLoop?.allowSubAgents).toBeUndefined()
    expect(agent.executionSteps?.toolLoop?.subAgentIds).toBeUndefined()
    expect(agent.executionSteps?.toolLoop?.tools).toHaveLength(1)
  })

  it('creates toolLoop with allowSubAgents when agent has no prior executionSteps', () => {
    const agent = {
      allowSubAgents: true,
      availableSkillTools: [],
      toolLoopMaxIterations: 25,
    }
    applySubAgentSettingsToExecutionSteps(agent)
    expect(agent.executionSteps?.toolLoop?.allowSubAgents).toBe(true)
    expect(agent.executionSteps?.toolLoop?.maxIterations).toBeGreaterThan(0)
    expect(agent.executionSteps?.toolLoop?.tools).toEqual([])
  })

  it('defaults allowSubAgents to enabled when undefined', () => {
    const agent = {
      availableSkillTools: [{ name: 'read_file' }],
      toolLoopMaxIterations: 40,
    }
    applySubAgentSettingsToExecutionSteps(agent)
    expect(agent.executionSteps?.toolLoop?.allowSubAgents).toBe(true)
  })
})

describe('sub-agent target allow-list', () => {
  it('treats empty allow-list as allow all', () => {
    expect(isSubAgentTargetAllowed('skill:a', [])).toBe(true)
    expect(isSubAgentTargetAllowed('skill:a', null)).toBe(true)
    expect(isSubAgentTargetAllowed('skill:a', ['skill:b'])).toBe(false)
  })

  it('toggleSubAgentTargetSelection unchecks from allow-all mode', () => {
    expect(
      toggleSubAgentTargetSelection(
        'skill:b',
        false,
        [],
        ['skill:a', 'skill:b', 'skill:c'],
      ),
    ).toEqual(['skill:a', 'skill:c'])
  })

  it('toggleSubAgentTargetSelection collapses to allow-all when every target selected', () => {
    expect(
      toggleSubAgentTargetSelection(
        'skill:c',
        true,
        ['skill:a', 'skill:b'],
        ['skill:a', 'skill:b', 'skill:c'],
      ),
    ).toEqual([])
  })
})
