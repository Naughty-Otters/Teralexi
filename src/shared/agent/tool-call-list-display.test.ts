import { describe, expect, it } from 'vitest'
import {
  filterAssistantToolGroupBubbles,
  filterConversationToolResponseBubbles,
  filterToolLoopPanelSlots,
  parseChatUiToolCallListDisplay,
} from './tool-call-list-display'

describe('tool-call-list-display', () => {
  it('parses legacy boolean strings', () => {
    expect(parseChatUiToolCallListDisplay('true')).toBe('all')
    expect(parseChatUiToolCallListDisplay('false')).toBe('none')
    expect(parseChatUiToolCallListDisplay('latest')).toBe('latest')
  })

  it('keeps only the last tool-group bubble in latest mode', () => {
    const bubbles = [
      { kind: 'step-progress', key: 'a' },
      { kind: 'tool-group', key: 'g1' },
      { kind: 'tool-group', key: 'g2' },
      { kind: 'text', key: 't' },
    ]

    expect(filterAssistantToolGroupBubbles(bubbles, 'all')).toHaveLength(4)
    expect(filterAssistantToolGroupBubbles(bubbles, 'none')).toEqual([
      { kind: 'step-progress', key: 'a' },
      { kind: 'text', key: 't' },
    ])
    expect(filterAssistantToolGroupBubbles(bubbles, 'latest')).toEqual([
      { kind: 'step-progress', key: 'a' },
      { kind: 'tool-group', key: 'g2' },
      { kind: 'text', key: 't' },
    ])
  })

  it('keeps only the last tool-loop panel slot in latest mode', () => {
    const slots = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
    expect(filterToolLoopPanelSlots(slots, 'all')).toHaveLength(3)
    expect(filterToolLoopPanelSlots(slots, 'none')).toEqual([])
    expect(filterToolLoopPanelSlots(slots, 'latest')).toEqual([{ key: 'c' }])
  })

  it('filters legacy tool response bubbles', () => {
    const bubbles = [{ key: '1' }, { key: '2' }]
    expect(filterConversationToolResponseBubbles(bubbles, 'none')).toEqual([])
    expect(filterConversationToolResponseBubbles(bubbles, 'latest')).toEqual([
      { key: '2' },
    ])
  })
})
