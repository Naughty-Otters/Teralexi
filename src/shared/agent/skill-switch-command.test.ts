import { describe, expect, it } from 'vitest'
import {
  formatSkillSwitchHelp,
  isSkillSwitchCommand,
  parseSkillSwitchCommand,
  resolveAgentIdForSkillSwitch,
} from './skill-switch-command'

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

describe('skill-switch-command', () => {
  it('parses /skill:<id> and rejects install alias', () => {
    expect(parseSkillSwitchCommand('/skill:coding')).toBe('coding')
    expect(parseSkillSwitchCommand('  /skill:default  ')).toBe('default')
    expect(parseSkillSwitchCommand('/skill:install')).toBeNull()
    expect(parseSkillSwitchCommand('/skill:install https://x')).toBeNull()
    expect(isSkillSwitchCommand('/skill:coding')).toBe(true)
  })

  it('resolves agent id by skill id, prefixed id, or name', () => {
    expect(resolveAgentIdForSkillSwitch(agents, 'coding')).toBe('skill:coding')
    expect(resolveAgentIdForSkillSwitch(agents, 'skill:coding')).toBe(
      'skill:coding',
    )
    expect(resolveAgentIdForSkillSwitch(agents, 'Default')).toBe('skill:default')
    expect(resolveAgentIdForSkillSwitch(agents, 'missing')).toBeNull()
    expect(resolveAgentIdForSkillSwitch(agents, 'disabled')).toBeNull()
  })

  it('formats help with available skill ids', () => {
    const help = formatSkillSwitchHelp(agents)
    expect(help).toContain('/skill:<id>')
    expect(help).toContain('/skill:coding')
    expect(help).not.toContain('/skill:disabled')
  })
})
