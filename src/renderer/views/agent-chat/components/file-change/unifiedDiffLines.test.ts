import { describe, expect, it } from 'vitest'
import {
  countBriefDiffLines,
  parseUnifiedDiffLines,
  selectBriefDiffLines,
} from './unifiedDiffLines'

describe('selectBriefDiffLines', () => {
  it('starts at first change with one context line before it', () => {
    const diff = [
      'Index: app.js',
      '===================================================================',
      '--- app.js',
      '+++ app.js',
      '@@ -807,44 +807,9 @@',
      ' unchanged before',
      '-old line',
      '+new line',
      ' more context',
    ].join('\n')
    const lines = parseUnifiedDiffLines(diff)
    const brief = selectBriefDiffLines(lines, 5)
    expect(brief.map((line) => line.text)).toEqual([
      ' unchanged before',
      '-old line',
      '+new line',
      ' more context',
    ])
    expect(brief[0]?.kind).toBe('context')
    expect(brief[1]?.kind).toBe('remove')
    expect(brief[2]?.kind).toBe('add')
  })

  it('skips leading context that is not immediately before the change', () => {
    const lines = parseUnifiedDiffLines(
      [
        '@@ -1,6 +1,3 @@',
        ' far context',
        ' another',
        ' near',
        '-gone',
        '+here',
      ].join('\n'),
    )
    const brief = selectBriefDiffLines(lines, 3)
    expect(brief.map((line) => line.text)).toEqual([
      ' near',
      '-gone',
      '+here',
    ])
  })

  it('counts remaining brief lines for expand affordance', () => {
    const lines = parseUnifiedDiffLines(
      ['@@ -1 +1 @@', ' keep', '-a', '+b', ' after'].join('\n'),
    )
    expect(countBriefDiffLines(lines)).toBe(4)
    expect(selectBriefDiffLines(lines, 2)).toHaveLength(2)
  })
})
