import { describe, expect, it } from 'vitest'
import type { Conversation } from '@store/agent'
import { buildPaneConversationOptions } from './paneConversationOptions'

function conv(
  id: string,
  title: string,
  updatedAtMs: number,
): Conversation {
  return {
    id,
    agentId: 'agent-1',
    title,
    createdAt: new Date(updatedAtMs),
    updatedAt: new Date(updatedAtMs),
    type: 'ui',
    workspacePath: null,
  }
}

describe('buildPaneConversationOptions', () => {
  it('lists inactive conversations plus current and latest', () => {
    const conversations = [
      conv('old', 'Old', 1),
      conv('idle', 'Idle', 2),
      conv('open-b', 'Open B', 3),
      conv('latest', 'Latest', 99),
    ]
    const options = buildPaneConversationOptions({
      conversations,
      openConversationIds: ['old', 'open-b'],
      currentConversationId: 'old',
    })
    expect(options.map((o) => o.id)).toEqual(['latest', 'idle', 'old'])
    expect(options.find((o) => o.id === 'latest')?.label).toContain('(latest)')
  })

  it('excludes other open panes that are not latest', () => {
    const conversations = [
      conv('a', 'A', 1),
      conv('b', 'B', 2),
      conv('c', 'C', 3),
    ]
    const options = buildPaneConversationOptions({
      conversations,
      openConversationIds: ['a', 'b'],
      currentConversationId: 'a',
    })
    expect(options.map((o) => o.id)).toEqual(['c', 'a'])
  })
})
