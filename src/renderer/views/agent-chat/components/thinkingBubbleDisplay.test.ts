import { describe, expect, it } from 'vitest'
import {
  THINKING_COMPACT_STREAM_TAIL_CHARS,
  thinkingBubbleDisplayText,
} from './thinkingBubbleDisplay'

describe('thinkingBubbleDisplayText', () => {
  it('returns full capped text when expanded', () => {
    const raw = 'a'.repeat(THINKING_COMPACT_STREAM_TAIL_CHARS + 200)
    expect(
      thinkingBubbleDisplayText({
        raw,
        streaming: true,
        expanded: true,
      }),
    ).toBe(raw)
  })

  it('returns full capped text when not streaming', () => {
    const raw = 'done thinking'
    expect(
      thinkingBubbleDisplayText({
        raw,
        streaming: false,
        expanded: false,
      }),
    ).toBe(raw)
  })

  it('paints only a short tail while compact and streaming', () => {
    const raw = `head-${'x'.repeat(THINKING_COMPACT_STREAM_TAIL_CHARS)}-tail`
    const shown = thinkingBubbleDisplayText({
      raw,
      streaming: true,
      expanded: false,
    })
    expect(shown.startsWith('…\n')).toBe(true)
    expect(shown.length).toBeLessThan(raw.length)
    expect(shown.endsWith('-tail')).toBe(true)
  })
})
