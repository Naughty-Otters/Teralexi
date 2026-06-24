import { describe, expect, it } from 'vitest'
import {
  filterAssistantReasoningBubbles,
  filterThinkingConversationSections,
  parseChatUiThinkingBubbleDisplay,
} from './thinking-bubble-display'

const THINKING_IDS = new Set(['ThinkingStep', 'thinking'])

describe('thinking-bubble-display', () => {
  it('parses display modes', () => {
    expect(parseChatUiThinkingBubbleDisplay('latest')).toBe('latest')
    expect(parseChatUiThinkingBubbleDisplay(undefined)).toBe('latest')
  })

  it('filters reasoning bubbles in brief mode', () => {
    const bubbles = [
      { kind: 'markdown', key: 'm' },
      { kind: 'reasoning', key: 'r1' },
      { kind: 'reasoning', key: 'r2' },
    ]

    expect(filterAssistantReasoningBubbles(bubbles, 'all')).toHaveLength(3)
    expect(filterAssistantReasoningBubbles(bubbles, 'none')).toEqual([
      { kind: 'markdown', key: 'm' },
    ])
    expect(filterAssistantReasoningBubbles(bubbles, 'latest')).toEqual([
      { kind: 'markdown', key: 'm' },
      { kind: 'reasoning', key: 'r2' },
    ])
  })

  it('filters thinking conversation sections', () => {
    const sections = [
      { id: 'ThinkingStep' },
      { id: 'PlanningStep' },
      { id: 'thinking' },
      { id: 'SummaryStep' },
    ]

    expect(
      filterThinkingConversationSections(sections, 'none', THINKING_IDS),
    ).toEqual([{ id: 'PlanningStep' }, { id: 'SummaryStep' }])
    expect(
      filterThinkingConversationSections(sections, 'latest', THINKING_IDS),
    ).toEqual([
      { id: 'PlanningStep' },
      { id: 'thinking' },
      { id: 'SummaryStep' },
    ])
  })
})
