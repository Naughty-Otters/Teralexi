import { describe, expect, it } from 'vitest'
import { compactPaneScrollTop } from './reasoningBubbleLayout'

describe('compactPaneScrollTop', () => {
  it('pins to the tail so compact preview shows latest text, not the head', () => {
    // Tall content in a 70px viewport: scroll to bottom.
    expect(compactPaneScrollTop(400, 70)).toBe(330)
  })

  it('stays at 0 when content fits the viewport', () => {
    expect(compactPaneScrollTop(50, 70)).toBe(0)
  })
})
