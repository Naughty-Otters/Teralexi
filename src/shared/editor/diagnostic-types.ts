/** LSP diagnostic subset shared between main and renderer. */
export type SharedLspDiagnostic = {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  severity?: 1 | 2 | 3 | 4
  message: string
  source?: string
}

export type SharedLintDiagnostic = {
  line: number
  column: number
  endLine: number
  endColumn: number
  message: string
  severity: 'error' | 'warning'
  ruleId?: string
}
