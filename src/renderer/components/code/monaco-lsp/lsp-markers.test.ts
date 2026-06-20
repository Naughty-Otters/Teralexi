import { describe, expect, it } from 'vitest'
import {
  mergeMarkerSets,
  lspDiagnosticsToMarkers,
  eslintDiagnosticsToMarkers,
} from '@renderer/components/code/monaco-lsp/lsp-markers'

describe('lsp-markers', () => {
  it('merges eslint markers and dedupes overlapping lsp messages', () => {
    const lsp = lspDiagnosticsToMarkers([
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 1,
        message: 'Type error',
        source: 'typescript',
      },
    ])
    const eslint = eslintDiagnosticsToMarkers([
      {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        message: 'Unused var',
        severity: 'warning',
        ruleId: 'no-unused-vars',
      },
      {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        message: 'Type error',
        severity: 'error',
      },
    ])

    const merged = mergeMarkerSets(lsp, eslint)
    expect(merged.lsp).toHaveLength(1)
    expect(merged.eslint).toHaveLength(2)
    expect(merged.eslint.some((m) => m.message.includes('Unused var'))).toBe(true)
  })
})
