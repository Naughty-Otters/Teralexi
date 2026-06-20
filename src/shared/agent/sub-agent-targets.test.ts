import { describe, expect, it } from 'vitest'
import {
  filterSubAgentTargetsByQuery,
  extractFirstSubAgentMentionSlug,
  resolveDelegatableSubAgentTargets,
  resolveSubAgentMention,
  resolveSubAgentTargetBySlug,
  subAgentMentionQueryLooksLikePath,
  subAgentMentionSlug,
} from './sub-agent-targets'

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
  {
    id: 'private',
    name: 'Private',
    allowAsSubAgent: false,
  },
]

describe('sub-agent-targets', () => {
  it('subAgentMentionSlug normalizes names', () => {
    expect(subAgentMentionSlug('Code Assistant')).toBe('code-assistant')
  })

  it('resolveDelegatableSubAgentTargets respects caller allowSubAgents and allow-list', () => {
    expect(
      resolveDelegatableSubAgentTargets(
        { id: 'main', allowSubAgents: false },
        agents,
      ),
    ).toEqual([])

    const all = resolveDelegatableSubAgentTargets(
      { id: 'main', allowSubAgents: true },
      agents,
    )
    expect(all.map((t) => t.id)).toEqual(['skill:coding', 'research'])

    const restricted = resolveDelegatableSubAgentTargets(
      {
        id: 'main',
        allowSubAgents: true,
        subAgentIds: ['research'],
      },
      agents,
    )
    expect(restricted.map((t) => t.id)).toEqual(['research'])
  })

  it('resolveSubAgentMention finds slug anywhere and strips token from task', () => {
    const targets = resolveDelegatableSubAgentTargets(
      { id: 'main', allowSubAgents: true },
      agents,
    )
    expect(
      resolveSubAgentMention('Hey @code help me build a website', targets),
    ).toEqual({
      agentId: 'skill:coding',
      mentionSlug: 'code',
      task: 'Hey help me build a website',
    })
  })

  it('resolveSubAgentTargetBySlug matches id and slug', () => {
    const targets = resolveDelegatableSubAgentTargets(
      { id: 'main', allowSubAgents: true },
      agents,
    )
    expect(resolveSubAgentTargetBySlug('code', targets)?.id).toBe('skill:coding')
    expect(resolveSubAgentTargetBySlug('research', targets)?.id).toBe('research')
  })

  it('filterSubAgentTargetsByQuery filters by prefix', () => {
    const targets = resolveDelegatableSubAgentTargets(
      { id: 'main', allowSubAgents: true },
      agents,
    )
    expect(filterSubAgentTargetsByQuery(targets, 'cod').map((t) => t.id)).toEqual([
      'skill:coding',
    ])
  })

  it('subAgentMentionQueryLooksLikePath detects file paths', () => {
    expect(subAgentMentionQueryLooksLikePath('src/foo.ts')).toBe(true)
    expect(subAgentMentionQueryLooksLikePath('code')).toBe(false)
  })

  it('extractFirstSubAgentMentionSlug ignores path-like tokens', () => {
    expect(extractFirstSubAgentMentionSlug('see @src/foo.ts')).toBe(null)
    expect(extractFirstSubAgentMentionSlug('Hey @code help')).toBe('code')
  })
})
