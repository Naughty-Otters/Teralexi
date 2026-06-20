import { describe, expect, it } from 'vitest'
import { truncateString } from './str-utils'

describe('truncateString', () => {
  it('returns trimmed text when under limit', () => {
    expect(truncateString('  hello  ', 10)).toBe('hello')
  })

  it('truncates long text with ellipsis marker', () => {
    expect(truncateString('abcdefghij', 5)).toBe('abcde\n…')
  })
})
