import { describe, expect, it } from 'vitest'
import {
  formatNumberedLines,
  isLikelyBinary,
  truncateLine,
} from './format-tool-output'
import { MAX_LINE_CHARS, MAX_READ_OUTPUT_BYTES } from './constants'

describe('format-tool-output', () => {
  it('truncateLine leaves short lines unchanged', () => {
    expect(truncateLine('hello')).toBe('hello')
    const long = 'x'.repeat(MAX_LINE_CHARS + 10)
    const truncated = truncateLine(long)
    expect(truncated).toContain('truncated')
    expect(truncated).not.toBe(long)
  })

  it('formatNumberedLines respects byte budget', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line-${i}-${'z'.repeat(200)}`)
    const { truncated, linesShown, text } = formatNumberedLines(lines, 1)
    expect(truncated).toBe(true)
    expect(linesShown).toBeGreaterThan(0)
    expect(linesShown).toBeLessThan(lines.length)
    expect(text).toContain('1:')
    expect(Buffer.byteLength(text, 'utf-8')).toBeLessThanOrEqual(
      MAX_READ_OUTPUT_BYTES + 200,
    )
  })

  it('formatNumberedLines includes all lines when small', () => {
    const { truncated, linesShown, text } = formatNumberedLines(['a', 'b'], 10)
    expect(truncated).toBe(false)
    expect(linesShown).toBe(2)
    expect(text).toContain('10: a')
    expect(text).toContain('11: b')
  })

  it('isLikelyBinary detects null bytes and noisy buffers', () => {
    expect(isLikelyBinary(Buffer.alloc(0))).toBe(false)
    expect(isLikelyBinary(Buffer.from('plain text\n'))).toBe(false)
    expect(isLikelyBinary(Buffer.from([0, 1, 2, 3]))).toBe(true)
    const noisy = Buffer.alloc(100, 1)
    expect(isLikelyBinary(noisy)).toBe(true)
  })
})
