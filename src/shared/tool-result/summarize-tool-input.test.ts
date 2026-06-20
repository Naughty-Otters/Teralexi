import { describe, expect, it } from 'vitest'
import { summarizeToolInput } from './summarize-tool-input'

describe('summarizeToolInput', () => {
  it('formats priority fields as key=value pairs', () => {
    expect(
      summarizeToolInput({ path: 'src', recursive: false, maxDepth: 2 }),
    ).toBe('path=src, recursive=false, maxDepth=2')
  })

  it('includes pattern and query for search tools', () => {
    expect(
      summarizeToolInput({ pattern: 'foo', path: 'src' }),
    ).toBe('path=src, pattern=foo')
  })

  it('returns empty for nullish input', () => {
    expect(summarizeToolInput(null)).toBe('')
    expect(summarizeToolInput(undefined)).toBe('')
  })
})
