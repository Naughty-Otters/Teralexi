import { describe, expect, it } from 'vitest'
import {
  formatSubAgentSlashHelp,
  isSubAgentSlashCommand,
  parseSubAgentSlashCommand,
} from './sub-agent-slash-command'
import { resolveDelegatableSubAgentTargets } from './sub-agent-targets'

const agents = [
  {
    id: 'skill:coding',
    name: 'Code',
    description: 'Coding agent',
    allowAsSubAgent: true,
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Research agent',
    allowAsSubAgent: true,
  },
]

describe('sub-agent-slash-command', () => {
  const targets = resolveDelegatableSubAgentTargets(
    { id: 'main', allowSubAgents: true },
    agents,
  )

  it('detects /sub-agent prefix', () => {
    expect(isSubAgentSlashCommand('/sub-agent')).toBe(true)
    expect(isSubAgentSlashCommand('/sub-agent @code fix bug')).toBe(true)
    expect(isSubAgentSlashCommand('/sub-agents')).toBe(false)
  })

  it('parses slug and task with or without @', () => {
    expect(parseSubAgentSlashCommand('/sub-agent @code fix the login bug', targets)).toEqual({
      agentId: 'skill:coding',
      mentionSlug: 'code',
      task: 'fix the login bug',
    })
    expect(parseSubAgentSlashCommand('/sub-agent code fix the login bug', targets)).toEqual({
      agentId: 'skill:coding',
      mentionSlug: 'code',
      task: 'fix the login bug',
    })
  })

  it('returns null when slug or task is missing', () => {
    expect(parseSubAgentSlashCommand('/sub-agent', targets)).toBeNull()
    expect(parseSubAgentSlashCommand('/sub-agent code', targets)).toBeNull()
    expect(parseSubAgentSlashCommand('/sub-agent unknown do work', targets)).toBeNull()
  })

  it('formats help with available targets', () => {
    const help = formatSubAgentSlashHelp(targets)
    expect(help).toContain('/sub-agent @<slug> <task>')
    expect(help).toContain('@research')
  })
})
