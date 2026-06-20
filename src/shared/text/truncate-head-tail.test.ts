import { describe, expect, it } from 'vitest'
import {
  HEAD_TAIL_KEEP_CHARS,
  HEAD_TAIL_OMISSION,
  truncateHeadTail,
} from './truncate-head-tail'

describe('truncateHeadTail', () => {
  it('returns short text unchanged', () => {
    expect(truncateHeadTail('hello')).toBe('hello')
    expect(truncateHeadTail('x'.repeat(HEAD_TAIL_KEEP_CHARS * 2))).toBe(
      'x'.repeat(HEAD_TAIL_KEEP_CHARS * 2),
    )
  })

  it('keeps first and last 200 chars with omission in the middle', () => {
    const head = `START_${'a'.repeat(HEAD_TAIL_KEEP_CHARS - 6)}`
    const tail = `${'z'.repeat(HEAD_TAIL_KEEP_CHARS - 11)}_END_MARKER`
    const text = `${head}MIDDLE_SHOULD_GO${tail}`
    const limited = truncateHeadTail(text)

    expect(limited.startsWith(head)).toBe(true)
    expect(limited.endsWith(tail)).toBe(true)
    expect(limited).toContain(HEAD_TAIL_OMISSION)
    expect(limited).not.toContain('MIDDLE_SHOULD_GO')
  })
})
