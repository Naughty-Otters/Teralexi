import { describe, expect, it } from 'vitest'
import {
  buildConversationMetaLine,
  DEFAULT_CONVERSATION_LIST_ITEM_LABELS,
  parseConversationListItemLabels,
  serializeConversationListItemLabels,
  sessionTypeLabel,
} from './conversation-list-item-labels'

describe('conversation-list-item-labels', () => {
  it('defaults all label fields off', () => {
    expect(DEFAULT_CONVERSATION_LIST_ITEM_LABELS).toEqual({
      type: false,
      agent: false,
      date: false,
    })
    expect(parseConversationListItemLabels(null)).toEqual(
      DEFAULT_CONVERSATION_LIST_ITEM_LABELS,
    )
    expect(parseConversationListItemLabels('not-json')).toEqual(
      DEFAULT_CONVERSATION_LIST_ITEM_LABELS,
    )
  })

  it('round-trips label visibility prefs', () => {
    const value = { type: true, agent: false, date: true }
    const raw = serializeConversationListItemLabels(value)
    expect(parseConversationListItemLabels(raw)).toEqual(value)
  })

  it('maps conversation types for the type label', () => {
    expect(sessionTypeLabel('ui')).toBe('Chat')
    expect(sessionTypeLabel('channel')).toBe('Channel')
    expect(sessionTypeLabel('scheduler')).toBe('Scheduler')
  })

  it('builds meta line from enabled label fields', () => {
    const conv = {
      type: 'channel' as const,
      agentName: 'Research',
      updatedAt: new Date('2026-07-14T12:00:00.000Z'),
    }
    expect(
      buildConversationMetaLine(conv, {
        type: true,
        agent: true,
        date: false,
      }),
    ).toBe('Channel · Research')
    expect(
      buildConversationMetaLine(conv, DEFAULT_CONVERSATION_LIST_ITEM_LABELS),
    ).toBe('')
  })
})
