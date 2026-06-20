import { describe, expect, it } from 'vitest'
import { HEAD_TAIL_KEEP_CHARS, HEAD_TAIL_OMISSION } from '@shared/text/truncate-head-tail'
import { limitTextForStreamingBubble } from './streamingBubbleTextLimit'

describe('limitTextForStreamingBubble', () => {
  it('returns short text unchanged', () => {
    expect(limitTextForStreamingBubble('hello')).toBe('hello')
  })

  it('keeps first and last chars with \\n....\\n in the middle', () => {
    const head = `START_${'a'.repeat(HEAD_TAIL_KEEP_CHARS - 6)}`
    const tail = `${'z'.repeat(HEAD_TAIL_KEEP_CHARS - 4)}_END`
    const text = `${head}MIDDLE${tail}`
    const limited = limitTextForStreamingBubble(text)

    expect(limited.startsWith(head)).toBe(true)
    expect(limited.endsWith(tail)).toBe(true)
    expect(limited).toContain(HEAD_TAIL_OMISSION)
    expect(limited).not.toContain('MIDDLE')
  })
})
