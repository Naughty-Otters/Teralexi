/** LSP wire types (subset) — positions are 0-based per the LSP spec. */

export type LspPosition = { line: number; character: number }

export type LspRange = { start: LspPosition; end: LspPosition }

/** LSP DiagnosticSeverity: 1 Error, 2 Warning, 3 Information, 4 Hint. */
export type LspSeverity = 1 | 2 | 3 | 4

export type LspDiagnostic = {
  range: LspRange
  severity?: LspSeverity
  message: string
  source?: string
  code?: string | number
}

/** A JSON-RPC message (request, response, or notification). */
export type JsonRpcMessage = {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ── Symbol-intelligence wire types (subset) ──────────────────────────────────

export type LspLocation = { uri: string; range: LspRange }

/** textDocument/definition may return LocationLink[] instead of Location[]. */
export type LspLocationLink = {
  targetUri: string
  targetRange: LspRange
  targetSelectionRange?: LspRange
}

export type LspHover = { contents: unknown; range?: LspRange }

/** Hierarchical symbols (textDocument/documentSymbol). */
export type LspDocumentSymbol = {
  name: string
  detail?: string
  kind: number
  range: LspRange
  selectionRange?: LspRange
  children?: LspDocumentSymbol[]
}

/** Flat symbols (legacy documentSymbol / workspace/symbol). */
export type LspSymbolInformation = {
  name: string
  kind: number
  location: LspLocation
  containerName?: string
}
