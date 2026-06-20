import type { SharedLintDiagnostic, SharedLspDiagnostic } from '@shared/editor/diagnostic-types'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { monaco } from '../monaco-setup'

const LSP_OWNER = 'lsp'
const ESLINT_OWNER = 'eslint'

function lspSeverityToMarker(severity?: SharedLspDiagnostic['severity']): MonacoEditorNS.MarkerSeverity {
  switch (severity) {
    case 2:
      return 4
    case 3:
      return 2
    case 4:
      return 1
    default:
      return 8
  }
}

function rangesOverlap(
  a: { startLine: number; startCol: number; endLine: number; endCol: number },
  b: { startLine: number; startCol: number; endLine: number; endCol: number },
): boolean {
  if (a.endLine < b.startLine || b.endLine < a.startLine) return false
  if (a.endLine === b.startLine && a.endCol <= b.startCol) return false
  if (b.endLine === a.startLine && b.endCol <= a.startCol) return false
  return true
}

export function lspDiagnosticsToMarkers(
  diagnostics: SharedLspDiagnostic[],
): MonacoEditorNS.IMarkerData[] {
  return diagnostics.map((diag) => ({
    severity: lspSeverityToMarker(diag.severity),
    message: diag.source ? `${diag.message} (${diag.source})` : diag.message,
    startLineNumber: diag.range.start.line + 1,
    startColumn: diag.range.start.character + 1,
    endLineNumber: diag.range.end.line + 1,
    endColumn: diag.range.end.character + 1,
  }))
}

export function eslintDiagnosticsToMarkers(
  diagnostics: SharedLintDiagnostic[],
): MonacoEditorNS.IMarkerData[] {
  return diagnostics.map((diag) => ({
    severity: diag.severity === 'error' ? 8 : 4,
    message: diag.ruleId ? `${diag.message} (${diag.ruleId})` : diag.message,
    startLineNumber: diag.line,
    startColumn: diag.column,
    endLineNumber: diag.endLine,
    endColumn: diag.endColumn,
  }))
}

export function mergeMarkerSets(
  lspMarkers: MonacoEditorNS.IMarkerData[],
  eslintMarkers: MonacoEditorNS.IMarkerData[],
): {
  lsp: MonacoEditorNS.IMarkerData[]
  eslint: MonacoEditorNS.IMarkerData[]
} {
  const dedupedEslint = eslintMarkers.filter((eslintMarker) => {
    return !lspMarkers.some((lspMarker) => {
      return (
        lspMarker.message === eslintMarker.message &&
        rangesOverlap(
          {
            startLine: lspMarker.startLineNumber,
            startCol: lspMarker.startColumn,
            endLine: lspMarker.endLineNumber,
            endCol: lspMarker.endColumn,
          },
          {
            startLine: eslintMarker.startLineNumber,
            startCol: eslintMarker.startColumn,
            endLine: eslintMarker.endLineNumber,
            endCol: eslintMarker.endColumn,
          },
        )
      )
    })
  })

  return { lsp: lspMarkers, eslint: dedupedEslint }
}

export function applyMergedMarkers(
  monaco: typeof import('monaco-editor'),
  model: MonacoEditorNS.ITextModel,
  lspMarkers: MonacoEditorNS.IMarkerData[],
  eslintMarkers: MonacoEditorNS.IMarkerData[],
): void {
  const merged = mergeMarkerSets(lspMarkers, eslintMarkers)
  monaco.editor.setModelMarkers(model, LSP_OWNER, merged.lsp)
  monaco.editor.setModelMarkers(model, ESLINT_OWNER, merged.eslint)
}

export function countMarkerSeverities(markers: MonacoEditorNS.IMarkerData[]): {
  errors: number
  warnings: number
} {
  let errors = 0
  let warnings = 0
  for (const marker of markers) {
    if (marker.severity === 8) errors += 1
    else if (marker.severity === 4) warnings += 1
  }
  return { errors, warnings }
}

export function clearAllEditorMarkers(
  monaco: typeof import('monaco-editor'),
  model: MonacoEditorNS.ITextModel,
): void {
  monaco.editor.setModelMarkers(model, LSP_OWNER, [])
  monaco.editor.setModelMarkers(model, ESLINT_OWNER, [])
}

export { LSP_OWNER, ESLINT_OWNER }
