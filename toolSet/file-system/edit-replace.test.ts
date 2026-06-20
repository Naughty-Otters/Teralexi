import { describe, expect, it } from 'vitest'
import {
  BlockAnchorReplacer,
  ContextAwareReplacer,
  EscapeNormalizedReplacer,
  IndentationFlexibleReplacer,
  LineTrimmedReplacer,
  MultiOccurrenceReplacer,
  TrimmedBoundaryReplacer,
  WhitespaceNormalizedReplacer,
  replace,
} from './edit-replace'

describe('edit-replace', () => {
  it('replaces exact match', () => {
    const content = 'hello world\nfoo bar'
    expect(replace(content, 'foo bar', 'baz qux')).toBe('hello world\nbaz qux')
  })

  it('replaces with line-trimmed matcher', () => {
    const content = '  hello world  '
    expect(replace(content, 'hello world', 'goodbye')).toBe('  goodbye  ')
  })

  it('supports replace_all', () => {
    const content = 'a\na\nb'
    expect(replace(content, 'a', 'x', true)).toBe('x\nx\nb')
  })

  it('throws when oldString not found', () => {
    expect(() => replace('abc', 'missing', 'x')).toThrow(
      /Could not find oldString/,
    )
  })

  it('throws on multiple matches without replace_all', () => {
    expect(() => replace('a\na', 'a', 'b')).toThrow(/multiple matches/)
  })

  it('throws when old and new are identical', () => {
    expect(() => replace('abc', 'a', 'a')).toThrow(/identical/)
  })

  it('matches with whitespace normalization', () => {
    const content = 'const  value   =   1'
    const matches = [...WhitespaceNormalizedReplacer(content, 'value = 1')]
    expect(matches).toContain('value   =   1')
  })

  it('matches with indentation flexibility', () => {
    const content = '  if (ok) {\n    run()\n  }'
    const find = 'if (ok) {\n  run()\n}'
    const matches = [...IndentationFlexibleReplacer(content, find)]
    expect(matches).toEqual(['  if (ok) {\n    run()\n  }'])
  })

  it('matches escaped content', () => {
    const content = 'first\nline1\nline2\nlast'
    const matches = [...EscapeNormalizedReplacer(content, 'line1\\nline2')]
    expect(matches).toContain('line1\nline2')
  })

  it('finds multiple occurrences', () => {
    const content = 'a b a b a'
    const matches = [...MultiOccurrenceReplacer(content, 'a')]
    expect(matches).toHaveLength(3)
  })

  it('matches trimmed boundaries and line-trimmed blocks', () => {
    const content = '  alpha\n beta\n'
    expect([...TrimmedBoundaryReplacer(content, '  alpha  ')]).toContain(
      'alpha',
    )
    expect([...LineTrimmedReplacer(content, 'alpha\nbeta')]).toEqual([
      '  alpha\n beta',
    ])
  })

  it('matches anchor and context-aware blocks', () => {
    const content = [
      'function a() {',
      '  const x = 1',
      '}',
      '',
      'function b() {',
      '  const y = 2',
      '}',
    ].join('\n')

    const find = ['function b() {', 'const y = 2', '}'].join('\n')
    expect([...BlockAnchorReplacer(content, find)]).toEqual([
      'function b() {\n  const y = 2\n}',
    ])
    expect([...ContextAwareReplacer(content, find)]).toEqual([
      'function b() {\n  const y = 2\n}',
    ])
  })

  it('trimmed boundary returns no match when find is already trimmed', () => {
    expect([...TrimmedBoundaryReplacer('alpha', 'alpha')]).toEqual([])
  })

  it('context-aware skips short patterns and low-similarity middle lines', () => {
    expect([...ContextAwareReplacer('a\nb', 'a\nb')]).toEqual([])

    const content = ['start {', '  one', '}', 'start {', '  two', '}'].join('\n')
    const find = ['start {', '  three', '}'].join('\n')
    expect([...ContextAwareReplacer(content, find)]).toEqual([])
  })

  it('context-aware handles trailing newline in find block', () => {
    const content = ['begin {', '  value', '}'].join('\n')
    const find = ['begin {', '  value', '}', ''].join('\n')
    expect([...ContextAwareReplacer(content, find)]).toEqual([
      'begin {\n  value\n}',
    ])
  })

  it('escape-normalized handles escaped dollar and no-match path', () => {
    const content = 'price is $100'
    expect([...EscapeNormalizedReplacer(content, '\\$100')]).toContain('$100')
    expect([...EscapeNormalizedReplacer(content, 'missing\\nvalue')]).toEqual([])
  })
})
