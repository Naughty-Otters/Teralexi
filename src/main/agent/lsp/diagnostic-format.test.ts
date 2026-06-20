import { describe, expect, it } from 'vitest'
import { buildDiagnosticReport, formatDiagnostic } from './diagnostic-format'
import type { LspDiagnostic } from './types'

const err = (line: number, char: number, message: string): LspDiagnostic => ({
  range: { start: { line, character: char }, end: { line, character: char } },
  severity: 1,
  message,
})

const warn = (message: string): LspDiagnostic => ({
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  severity: 2,
  message,
})

describe('formatDiagnostic', () => {
  it('renders 1-based line:col with severity', () => {
    expect(formatDiagnostic(err(11, 4, "Cannot find name 'foo'."))).toBe(
      "ERROR [12:5] Cannot find name 'foo'.",
    )
  })

  it('collapses whitespace and appends source', () => {
    expect(
      formatDiagnostic({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        severity: 2,
        message: 'multi\n  line   message',
        source: 'eslint',
      }),
    ).toBe('WARN [1:1] multi line message (eslint)')
  })
})

describe('buildDiagnosticReport', () => {
  it('returns an empty block when there are no errors', () => {
    const report = buildDiagnosticReport('/ws/src/a.ts', '/ws', [warn('unused var')])
    expect(report.block).toBe('')
    expect(report.errorCount).toBe(0)
    expect(report.warningCount).toBe(1)
  })

  it('surfaces only errors by default, with a workspace-relative path', () => {
    const report = buildDiagnosticReport(
      '/ws/src/a.ts',
      '/ws',
      [err(0, 0, 'boom'), warn('nit')],
    )
    expect(report.errorCount).toBe(1)
    expect(report.block).toContain('<diagnostics file="src/a.ts">')
    expect(report.block).toContain('ERROR [1:1] boom')
    expect(report.block).not.toContain('nit')
    expect(report.block.endsWith('</diagnostics>')).toBe(true)
  })

  it('includes warnings when asked', () => {
    const report = buildDiagnosticReport('/ws/a.ts', '/ws', [err(0, 0, 'boom'), warn('nit')], {
      includeWarnings: true,
    })
    expect(report.block).toContain('boom')
    expect(report.block).toContain('nit')
  })

  it('caps the number of diagnostics and notes the omitted count', () => {
    const many = Array.from({ length: 25 }, (_, i) => err(i, 0, `e${i}`))
    const report = buildDiagnosticReport('/ws/a.ts', '/ws', many, { max: 5 })
    expect(report.errorCount).toBe(25)
    expect(report.block).toContain('… and 20 more')
  })
})
