import { describe, expect, it } from 'vitest'
import {
  describeAgentSlashStatus,
  formatAgentSwitchHelp,
  isAgentSlashCommand,
  parseAgentSlashCommand,
  resolveAgentIdForAgentSwitch,
} from './agent-switch-command'

const agents = [
  {
    id: 'skill:coding',
    skillId: 'coding',
    name: 'Coding',
    enabled: true,
  },
  {
    id: 'skill:default',
    skillId: 'default',
    name: 'Default',
    enabled: true,
  },
  {
    id: 'custom-1',
    name: 'Custom',
    enabled: true,
  },
  {
    id: 'skill:disabled',
    skillId: 'disabled',
    name: 'Disabled',
    enabled: false,
  },
]

describe('agent-switch-command', () => {
  it('parses /agent subcommands', () => {
    expect(parseAgentSlashCommand('/agent')).toEqual({ kind: 'status' })
    expect(parseAgentSlashCommand('/agent pick')).toEqual({ kind: 'pick' })
    expect(parseAgentSlashCommand('/agent coding')).toEqual({
      kind: 'switch',
      target: 'coding',
    })
    expect(parseAgentSlashCommand('/agent "Custom Agent"')).toEqual({
      kind: 'switch',
      target: 'Custom Agent',
    })
    expect(parseAgentSlashCommand('/skill:coding')).toBeNull()
    expect(isAgentSlashCommand('/agent pick')).toBe(true)
  })

  it('resolves agent id by id, skill id, or name', () => {
    expect(resolveAgentIdForAgentSwitch(agents, 'coding')).toBe('skill:coding')
    expect(resolveAgentIdForAgentSwitch(agents, 'skill:coding')).toBe(
      'skill:coding',
    )
    expect(resolveAgentIdForAgentSwitch(agents, 'custom-1')).toBe('custom-1')
    expect(resolveAgentIdForAgentSwitch(agents, 'Custom')).toBe('custom-1')
    expect(resolveAgentIdForAgentSwitch(agents, 'disabled')).toBeNull()
    expect(resolveAgentIdForAgentSwitch(agents, 'missing')).toBeNull()
  })

  it('describes status and formats help', () => {
    expect(describeAgentSlashStatus('skill:coding', agents)).toBe(
      'Agent: Coding (skill:coding)',
    )
    expect(describeAgentSlashStatus(null, agents)).toBe('Agent: none selected')

    const help = formatAgentSwitchHelp(agents)
    expect(help).toContain('/agent pick')
    expect(help).toContain('/agent coding')
    expect(help).toContain('/agent custom-1')
    expect(help).not.toContain('Disabled')
  })
})
