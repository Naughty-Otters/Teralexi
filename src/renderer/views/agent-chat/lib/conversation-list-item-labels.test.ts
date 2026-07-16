import { describe, expect, it } from 'vitest'
import {
  buildConversationDetailTooltip,
  buildConversationDetailTooltipModel,
  buildConversationMetaLine,
  DEFAULT_CONVERSATION_LIST_ITEM_LABELS,
  formatAgentTypeLabel,
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

  it('builds a structured detail tooltip model', () => {
    const model = buildConversationDetailTooltipModel({
      title: 'Rewrite landing page',
      type: 'ui',
      agentName: 'Website',
      agentType: 'Skill · website',
      updatedAt: new Date('2026-07-14T12:00:00.000Z'),
      workspacePath: '/tmp/my-site',
      messageCount: 3,
    })
    expect(model.title).toBe('Rewrite landing page')
    expect(model.rows).toEqual(
      expect.arrayContaining([
        { label: 'Session', value: 'Chat' },
        { label: 'Agent', value: 'Website' },
        { label: 'Type', value: 'Skill · website' },
        { label: 'Workspace', value: '/tmp/my-site' },
        { label: 'Messages', value: '3' },
      ]),
    )
    expect(buildConversationDetailTooltip({
      title: 'Rewrite landing page',
      type: 'ui',
      agentName: 'Website',
      agentType: 'Skill · website',
      updatedAt: new Date('2026-07-14T12:00:00.000Z'),
      workspacePath: '/tmp/my-site',
      messageCount: 3,
    })).toContain('Workspace: /tmp/my-site')
  })

  it('omits workspace row when path is missing', () => {
    const model = buildConversationDetailTooltipModel({
      title: 'No workspace',
      type: 'channel',
      agentName: 'Bot',
      agentType: 'Custom',
      updatedAt: new Date('2026-07-14T12:00:00.000Z'),
    })
    expect(model.rows.some((row) => row.label === 'Type')).toBe(true)
    expect(model.rows.some((row) => row.label === 'Workspace')).toBe(false)
  })

  it('formats skill vs custom agent type labels', () => {
    expect(formatAgentTypeLabel({ isSkill: false })).toBe('Custom')
    expect(
      formatAgentTypeLabel({
        isSkill: true,
        skillId: 'website',
        skillGroupLabel: 'Website',
      }),
    ).toBe('Skill · Website')
    expect(
      formatAgentTypeLabel({
        isSkill: true,
        skillId: 'website',
        skillGroupLabel: 'Website',
        skillVariantLabel: 'Portfolio',
      }),
    ).toBe('Skill · Website · Portfolio')
  })
})
