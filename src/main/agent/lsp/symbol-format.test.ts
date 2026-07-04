import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { isWin, p } from '@test-paths'
import {
  hoverToText,
  normalizeDocumentSymbols,
  normalizeLocations,
  normalizeWorkspaceSymbols,
  symbolKindName,
} from './symbol-format'

const WS = '/ws'
const uri = (rel: string) => pathToFileURL(join(WS, rel)).toString()
const range = (line: number, char: number) => ({
  start: { line, character: char },
  end: { line, character: char + 4 },
})

describe('symbolKindName', () => {
  it('maps known kinds and falls back for unknown', () => {
    expect(symbolKindName(5)).toBe('class')
    expect(symbolKindName(12)).toBe('function')
    expect(symbolKindName(99)).toBe('kind-99')
  })
})

describe('normalizeLocations', () => {
  it('handles a single Location (0-based → 1-based) and relativizes the path', () => {
    const out = normalizeLocations({ uri: uri('src/a.ts'), range: range(10, 4) }, WS)
    expect(out.map((item) => ({ ...item, path: p(item.path) }))).toEqual([
      { path: 'src/a.ts', line: 11, character: 5, endLine: 11, endCharacter: 9 },
    ])
  })

  it('handles a Location[] and a LocationLink[]', () => {
    expect(normalizeLocations([{ uri: uri('a.ts'), range: range(0, 0) }], WS)).toHaveLength(1)
    const links = [{ targetUri: uri('b.ts'), targetRange: range(2, 1) }]
    expect(normalizeLocations(links, WS).map((item) => ({ ...item, path: p(item.path) }))).toEqual([
      { path: 'b.ts', line: 3, character: 2, endLine: 3, endCharacter: 6 },
    ])
  })

  it('returns [] for null/empty', () => {
    expect(normalizeLocations(null, WS)).toEqual([])
    expect(normalizeLocations([], WS)).toEqual([])
  })

  it('keeps absolute path when outside the workspace', () => {
    const other = isWin ? 'C:\\other\\x.ts' : '/other/x.ts'
    const out = normalizeLocations({ uri: pathToFileURL(other).toString(), range: range(0, 0) }, WS)
    expect(p(out[0]!.path)).toBe(p(other))
  })
})

describe('hoverToText', () => {
  it('reads a plain string, MarkupContent, MarkedString, and arrays', () => {
    expect(hoverToText({ contents: 'hello' })).toBe('hello')
    expect(hoverToText({ contents: { kind: 'markdown', value: '`x: number`' } })).toBe('`x: number`')
    expect(hoverToText({ contents: { language: 'ts', value: 'const x = 1' } })).toBe('const x = 1')
    expect(hoverToText({ contents: ['a', { value: 'b' }] })).toBe('a\n\nb')
  })

  it('returns empty string for missing contents', () => {
    expect(hoverToText(null)).toBe('')
    expect(hoverToText({})).toBe('')
  })
})

describe('normalizeDocumentSymbols', () => {
  it('flattens a hierarchical DocumentSymbol[] with depth and selectionRange', () => {
    const result = [
      {
        name: 'Foo',
        kind: 5,
        range: range(0, 0),
        selectionRange: range(0, 6),
        children: [{ name: 'bar', kind: 6, range: range(1, 2), selectionRange: range(1, 2) }],
      },
    ]
    const out = normalizeDocumentSymbols(result)
    expect(out).toEqual([
      { name: 'Foo', kind: 'class', line: 1, character: 7, detail: undefined, depth: 0 },
      { name: 'bar', kind: 'method', line: 2, character: 3, detail: undefined, depth: 1 },
    ])
  })

  it('handles flat SymbolInformation[]', () => {
    const result = [
      { name: 'g', kind: 12, location: { uri: uri('a.ts'), range: range(4, 0) }, containerName: 'mod' },
    ]
    expect(normalizeDocumentSymbols(result)).toEqual([
      { name: 'g', kind: 'function', line: 5, character: 1, detail: 'mod', depth: 0 },
    ])
  })

  it('returns [] for non-arrays', () => {
    expect(normalizeDocumentSymbols(null)).toEqual([])
  })
})

describe('normalizeWorkspaceSymbols', () => {
  it('maps symbols with relative paths and 1-based positions', () => {
    const result = [
      { name: 'Widget', kind: 5, location: { uri: uri('src/w.ts'), range: range(9, 0) }, containerName: 'ui' },
    ]
    expect(normalizeWorkspaceSymbols(result, WS).map((item) => ({ ...item, path: p(item.path) }))).toEqual([
      { name: 'Widget', kind: 'class', path: 'src/w.ts', line: 10, character: 1, container: 'ui' },
    ])
  })
})
