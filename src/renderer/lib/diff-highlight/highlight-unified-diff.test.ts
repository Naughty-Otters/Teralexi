import { describe, expect, it } from 'vitest'
import {
  classifyLineForTest,
  highlightUnifiedDiff,
  parseHunkLineStarts,
} from './highlight-unified-diff'

describe('diff-highlight/highlight-unified-diff', () => {
  it('classifies diff lines', () => {
    expect(classifyLineForTest('@@ -1,3 +1,3 @@')).toBe('hunk')
    expect(classifyLineForTest('+added')).toBe('add')
    expect(classifyLineForTest('-removed')).toBe('remove')
  })

  it('parses hunk line starts', () => {
    expect(parseHunkLineStarts('@@ -10,4 +12,5 @@ fn')).toEqual({
      oldStart: 10,
      newStart: 12,
    })
    expect(parseHunkLineStarts('@@ -1 +1 @@')).toEqual({
      oldStart: 1,
      newStart: 1,
    })
    expect(parseHunkLineStarts('not a hunk')).toBeNull()
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
    expect(lines[3].oldLine).toBe(1)
    expect(lines[3].newLine).toBeNull()
    expect(lines[4].kind).toBe('add')
    expect(lines[4].gutter).toBe('+')
    expect(lines[4].html).toBe('new &amp; y')
    expect(lines[4].oldLine).toBeNull()
    expect(lines[4].newLine).toBe(1)
  })

  it('tracks old/new line numbers across context and multiple hunks', () => {
    const diff = [
      '@@ -5,3 +5,4 @@',
      ' keep',
      '-gone',
      '+here',
      '+also',
      '@@ -20,1 +22,1 @@',
      '-old',
      '+new',
    ].join('\n')

    const lines = highlightUnifiedDiff(diff)
    const code = lines.filter((line) =>
      line.kind === 'add' || line.kind === 'remove' || line.kind === 'context',
    )

    expect(code.map((line) => [line.kind, line.oldLine, line.newLine])).toEqual([
      ['context', 5, 5],
      ['remove', 6, null],
      ['add', null, 6],
      ['add', null, 7],
      ['remove', 20, null],
      ['add', null, 22],
    ])
  })

  it('falls back to sequential numbers when hunk headers are missing', () => {
    const lines = highlightUnifiedDiff('-old\n+new\n keep')
    expect(lines.map((line) => [line.kind, line.oldLine, line.newLine])).toEqual([
      ['remove', 1, null],
      ['add', null, 1],
      ['context', 2, 2],
    ])
  })
})
