import { describe, expect, it } from 'vitest'
import { classifyLineForTest, highlightUnifiedDiff } from './highlight-unified-diff'

describe('diff-highlight/highlight-unified-diff', () => {
  it('classifies diff lines', () => {
    expect(classifyLineForTest('@@ -1,3 +1,3 @@')).toBe('hunk')
    expect(classifyLineForTest('+added')).toBe('add')
    expect(classifyLineForTest('-removed')).toBe('remove')
  })

  it('highlights a small unified diff synchronously with escaped content', () => {
    const diff = [
      '--- a.ts',
      '+++ b.ts',
      '@@ -1,2 +1,2 @@',
      '-old <x>',
      '+new & y',
    ].join('\n')

    const lines = highlightUnifiedDiff(diff)

    expect(lines.length).toBe(5)
    expect(lines[3].kind).toBe('remove')
    expect(lines[3].gutter).toBe('−')
    expect(lines[3].html).toBe('old &lt;x&gt;')
    expect(lines[4].kind).toBe('add')
    expect(lines[4].gutter).toBe('+')
    expect(lines[4].html).toBe('new &amp; y')
  })
})
