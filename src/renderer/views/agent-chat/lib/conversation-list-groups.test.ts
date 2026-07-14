import { describe, expect, it } from 'vitest'
import {
  groupConversations,
  NO_WORKSPACE_GROUP_KEY,
  parseConversationListGroupBy,
  type ConversationListGroupItem,
} from './conversation-list-groups'

function item(
  partial: Partial<ConversationListGroupItem> & Pick<ConversationListGroupItem, 'id'>,
): ConversationListGroupItem {
  return {
    agentId: 'agent-a',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    workspacePath: null,
    ...partial,
  }
}

describe('parseConversationListGroupBy', () => {
  it('defaults unknown values to none', () => {
    expect(parseConversationListGroupBy(null)).toBe('none')
    expect(parseConversationListGroupBy('nope')).toBe('none')
  })

  it('accepts known modes', () => {
    expect(parseConversationListGroupBy('agent')).toBe('agent')
    expect(parseConversationListGroupBy('workspace')).toBe('workspace')
    expect(parseConversationListGroupBy('none')).toBe('none')
  })
})

describe('groupConversations', () => {
  const resolveAgent = (id: string) =>
    id === 'coding' ? 'Coding' : id === 'website' ? 'Website' : 'Agent'

  it('returns a single unlabeled group for none', () => {
    const items = [
      item({ id: '1', updatedAt: new Date('2026-02-01') }),
      item({ id: '2', updatedAt: new Date('2026-03-01') }),
    ]
    const groups = groupConversations(items, 'none', resolveAgent)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe('')
    expect(groups[0]?.items.map((c) => c.id)).toEqual(['2', '1'])
  })

  it('groups by agent and sorts groups by newest conversation', () => {
    const items = [
      item({
        id: 'old-web',
        agentId: 'website',
        updatedAt: new Date('2026-01-01'),
      }),
      item({
        id: 'new-code',
        agentId: 'coding',
        updatedAt: new Date('2026-03-01'),
      }),
      item({
        id: 'mid-web',
        agentId: 'website',
        updatedAt: new Date('2026-02-01'),
      }),
    ]
    const groups = groupConversations(items, 'agent', resolveAgent)
    expect(groups.map((g) => g.label)).toEqual(['Coding', 'Website'])
    expect(groups[0]?.items.map((c) => c.id)).toEqual(['new-code'])
    expect(groups[1]?.items.map((c) => c.id)).toEqual(['mid-web', 'old-web'])
  })

  it('groups by workspace basename with a No workspace bucket', () => {
    const items = [
      item({
        id: 'a',
        workspacePath: '/Users/me/alpha',
        updatedAt: new Date('2026-03-01'),
      }),
      item({
        id: 'b',
        workspacePath: null,
        updatedAt: new Date('2026-02-01'),
      }),
      item({
        id: 'c',
        workspacePath: '/Users/me/alpha',
        updatedAt: new Date('2026-01-01'),
      }),
      item({
        id: 'd',
        workspacePath: '/Users/me/beta',
        updatedAt: new Date('2026-04-01'),
      }),
    ]
    const groups = groupConversations(items, 'workspace', resolveAgent)
    expect(groups.map((g) => ({ key: g.key, label: g.label }))).toEqual([
      { key: '/Users/me/beta', label: 'beta' },
      { key: '/Users/me/alpha', label: 'alpha' },
      { key: NO_WORKSPACE_GROUP_KEY, label: 'No workspace' },
    ])
    expect(groups[1]?.items.map((c) => c.id)).toEqual(['a', 'c'])
  })
})
