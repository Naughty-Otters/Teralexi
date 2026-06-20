import { relative } from 'node:path'
import type { LspDiagnostic, LspSeverity } from './types'

const SEVERITY_LABEL: Record<LspSeverity, string> = {
  1: 'ERROR',
  2: 'WARN',
  3: 'INFO',
  4: 'HINT',
}

const DEFAULT_MAX_DIAGNOSTICS = 20

/** Format one diagnostic as `ERROR [line:col] message` (1-based for display). */
export function formatDiagnostic(d: LspDiagnostic): string {
  const severity = SEVERITY_LABEL[d.severity ?? 1]
  const line = d.range.start.line + 1
  const col = d.range.start.character + 1
  const source = d.source ? ` (${d.source})` : ''
  const message = d.message.replace(/\s+/g, ' ').trim()
  return `${severity} [${line}:${col}] ${message}${source}`
}

export type DiagnosticReport = {
  /** Number of error-severity diagnostics. */
  errorCount: number
  /** Number of warning-severity diagnostics. */
  warningCount: number
  /** Rendered block for the model, or '' when there is nothing to report. */
  block: string
}

/**
 * Build a diagnostics report for a single file.
 *
 * By default only **errors** are surfaced (matching the "please fix" intent) —
 * style warnings would otherwise be noise after every edit.
 */
export function buildDiagnosticReport(
  absFilePath: string,
  workspaceRoot: string | null,
  diagnostics: LspDiagnostic[],
  options: { includeWarnings?: boolean; max?: number } = {},
): DiagnosticReport {
  const errors = diagnostics.filter((d) => (d.severity ?? 1) === 1)
  const warnings = diagnostics.filter((d) => d.severity === 2)

  const surfaced = options.includeWarnings ? [...errors, ...warnings] : errors
  if (surfaced.length === 0) {
    return { errorCount: errors.length, warningCount: warnings.length, block: '' }
  }

  const max = options.max ?? DEFAULT_MAX_DIAGNOSTICS
  const limited = surfaced.slice(0, max)
  const omitted = surfaced.length - limited.length

  const displayPath = workspaceRoot
    ? relative(workspaceRoot, absFilePath) || absFilePath
    : absFilePath

  const lines = limited.map(formatDiagnostic)
  if (omitted > 0) lines.push(`… and ${omitted} more`)

  const block = `<diagnostics file="${displayPath}">\n${lines.join('\n')}\n</diagnostics>`
  return { errorCount: errors.length, warningCount: warnings.length, block }
}
