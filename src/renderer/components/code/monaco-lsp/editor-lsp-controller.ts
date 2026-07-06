import type { SharedLintDiagnostic, SharedLspDiagnostic } from '@shared/editor/diagnostic-types'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { monaco } from '../monaco-setup'
import {
  applyMergedMarkers,
  clearAllEditorMarkers,
  countMarkerSeverities,
  eslintDiagnosticsToMarkers,
  lspDiagnosticsToMarkers,
} from './lsp-markers'

type EditorLspRequestFn = (
  method: string,
  params: unknown,
) => Promise<{ ok: boolean; result?: unknown; error?: string }>

type EditorLintRequestFn = () => Promise<{
  ok: boolean
  diagnostics?: SharedLintDiagnostic[]
  error?: string
}>

export type EditorLspStatus = {
  language: string
  errors: number
  warnings: number
  hint: string | null
}

export class EditorLspController {
  private relativePath: string | null = null
  private languageId = 'plaintext'
  private model: MonacoEditorNS.ITextModel | null = null
  private editor: MonacoEditorNS.IStandaloneCodeEditor | null = null
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private lintTimer: ReturnType<typeof setTimeout> | null = null
  private lintDebounceMs = 500
  private eslintEnabled = true
  private disposed = false
  private lspSupported = false
  private lastLspMarkers: MonacoEditorNS.IMarkerData[] = []
  private lastEslintMarkers: MonacoEditorNS.IMarkerData[] = []
  private statusListeners = new Set<(status: EditorLspStatus) => void>()
  private providerDisposables: MonacoEditorNS.IDisposable[] = []

  private syncDocumentFn: ((content: string, languageId: string) => void) | null =
    null
  private closeDocumentFn: (() => void) | null = null
  private requestFn: EditorLspRequestFn | null = null
  private lintFn: EditorLintRequestFn | null = null
  private onGoToDefinition:
    | ((relativePath: string, line: number, column: number) => void)
    | null = null

  setCallbacks(callbacks: {
    syncDocument: (content: string, languageId: string) => void
    closeDocument: () => void
    request: EditorLspRequestFn
    lint?: EditorLintRequestFn
    onGoToDefinition?: (absolutePath: string, line: number, column: number) => void
  }): void {
    this.syncDocumentFn = callbacks.syncDocument
    this.closeDocumentFn = callbacks.closeDocument
    this.requestFn = callbacks.request
    this.lintFn = callbacks.lint ?? null
    this.onGoToDefinition = callbacks.onGoToDefinition ?? null
  }

  configure(options: {
    eslintEnabled?: boolean
    eslintDebounceMs?: number
  }): void {
    if (options.eslintEnabled != null) this.eslintEnabled = options.eslintEnabled
    if (options.eslintDebounceMs != null) {
      this.lintDebounceMs = options.eslintDebounceMs
    }
  }

  attachEditor(
    editor: MonacoEditorNS.IStandaloneCodeEditor,
    opts: {
      relativePath: string
      absoluteFilePath: string | null
      languageId: string
      lspSupported: boolean
      content: string
    },
  ): void {
    if (this.disposed) return
    this.detachProviders()
    this.editor = editor
    this.model = editor.getModel()
    this.relativePath = opts.relativePath
    this.languageId = opts.languageId
    this.lspSupported = opts.lspSupported
    this.lastLspMarkers = []
    this.lastEslintMarkers = []

    if (this.model && this.lspSupported) {
      this.registerProviders(this.model, opts.languageId, opts.absoluteFilePath)
      this.queueSync(opts.content)
    } else if (this.model) {
      clearAllEditorMarkers(monaco, this.model)
    }

    this.emitStatus()
  }

  updateContent(content: string, languageId: string): void {
    this.languageId = languageId
    if (!this.lspSupported || !this.model) return
    this.queueSync(content)
    if (this.eslintEnabled && this.lintFn) {
      this.queueLint()
    }
  }

  handleDiagnosticsNotification(diagnostics: SharedLspDiagnostic[]): void {
    if (!this.model || this.disposed) return
    this.lastLspMarkers = lspDiagnosticsToMarkers(diagnostics)
    applyMergedMarkers(monaco, this.model, this.lastLspMarkers, this.lastEslintMarkers)
    this.emitStatus()
  }

  onStatusChange(listener: (status: EditorLspStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener(this.currentStatus())
    return () => this.statusListeners.delete(listener)
  }

  dispose(): void {
    this.disposed = true
    if (this.syncTimer) clearTimeout(this.syncTimer)
    if (this.lintTimer) clearTimeout(this.lintTimer)
    this.closeDocumentFn?.()
    this.detachProviders()
    if (this.model) clearAllEditorMarkers(monaco, this.model)
    this.model = null
    this.editor = null
    this.statusListeners.clear()
  }

  private currentStatus(): EditorLspStatus {
    const counts = countMarkerSeverities([
      ...this.lastLspMarkers,
      ...this.lastEslintMarkers,
    ])
    return {
      language: this.languageId,
      errors: counts.errors,
      warnings: counts.warnings,
      hint: this.lspSupported ? null : 'No language server for this file type.',
    }
  }

  private emitStatus(): void {
    const status = this.currentStatus()
    for (const listener of this.statusListeners) listener(status)
  }

  private queueSync(content: string): void {
    if (!this.syncDocumentFn) return
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      this.syncDocumentFn?.(content, this.languageId)
    }, 200)
  }

  private queueLint(): void {
    if (!this.lintFn || !this.model) return
    if (this.lintTimer) clearTimeout(this.lintTimer)
    this.lintTimer = setTimeout(() => {
      this.lintTimer = null
      void this.runLint()
    }, this.lintDebounceMs)
  }

  private async runLint(): Promise<void> {
    if (!this.lintFn || !this.model || this.disposed) return
    const result = await this.lintFn()
    if (!result.ok || !this.model || this.disposed) return
    this.lastEslintMarkers = eslintDiagnosticsToMarkers(result.diagnostics ?? [])
    applyMergedMarkers(monaco, this.model, this.lastLspMarkers, this.lastEslintMarkers)
    this.emitStatus()
  }

  private registerProviders(
    model: MonacoEditorNS.ITextModel,
    languageId: string,
    absoluteFilePath: string | null,
  ): void {
    if (!this.requestFn) return

    const uri = resolveLspDocumentUri(model, absoluteFilePath)

    this.providerDisposables.push(
      monaco.languages.registerCompletionItemProvider(languageId, {
        triggerCharacters: ['.', '/', '<', '"', "'", '@', '#'],
        provideCompletionItems: async (m, position) => {
          if (m.uri.toString() !== uri) return { suggestions: [] }
          const result = await this.requestFn!('textDocument/completion', {
            textDocument: { uri },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          })
          if (!result.ok) return { suggestions: [] }
          return {
            suggestions: normalizeCompletionItems(result.result, m, position),
          }
        },
      }),
    )

    this.providerDisposables.push(
      monaco.languages.registerHoverProvider(languageId, {
        provideHover: async (m, position) => {
          if (m.uri.toString() !== uri) return null
          const result = await this.requestFn!('textDocument/hover', {
            textDocument: { uri },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          })
          if (!result.ok) return null
          return normalizeHover(result.result)
        },
      }),
    )

    this.providerDisposables.push(
      monaco.languages.registerDefinitionProvider(languageId, {
        provideDefinition: async (m, position) => {
          if (m.uri.toString() !== uri) return null
          const result = await this.requestFn!('textDocument/definition', {
            textDocument: { uri },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          })
          if (!result.ok) return null
          return normalizeDefinition(result.result, m.uri.toString(), this.onGoToDefinition)
        },
      }),
    )

    this.editor?.addAction({
      id: `teralexi-go-to-definition-${languageId}-${Date.now()}`,
      label: 'Go to Definition',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12],
      run: async (ed) => {
        const pos = ed.getPosition()
        if (!pos) return
        const result = await this.requestFn!('textDocument/definition', {
          textDocument: { uri: ed.getModel()?.uri.toString() ?? '' },
          position: {
            line: pos.lineNumber - 1,
            character: pos.column - 1,
          },
        })
        if (!result.ok) return
        const location = pickFirstLocation(result.result)
        if (!location || !this.onGoToDefinition) return
        this.onGoToDefinition(location.absolutePath, location.line, location.column)
      },
    })
  }

  private detachProviders(): void {
    for (const disposable of this.providerDisposables) disposable.dispose()
    this.providerDisposables = []
  }
}

function resolveLspDocumentUri(
  model: MonacoEditorNS.ITextModel,
  absoluteFilePath: string | null,
): string {
  if (absoluteFilePath?.trim()) {
    try {
      return monaco.Uri.file(absoluteFilePath.trim()).toString()
    } catch {
      // Fall back to the editor model URI below.
    }
  }
  return model.uri.toString()
}

function normalizeHover(raw: unknown): MonacoEditorNS.IMarkdownString | null {
  if (!raw || typeof raw !== 'object') return null
  const contents = (raw as { contents?: unknown }).contents
  if (typeof contents === 'string') {
    return { value: contents }
  }
  if (Array.isArray(contents)) {
    const value = contents
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'value' in part) {
          return String((part as { value?: unknown }).value ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
    return value ? { value } : null
  }
  if (contents && typeof contents === 'object' && 'value' in contents) {
    return { value: String((contents as { value?: unknown }).value ?? '') }
  }
  return null
}

function normalizeDefinition(
  raw: unknown,
  currentUri: string,
  onGoToDefinition:
    | ((absolutePath: string, line: number, column: number) => void)
    | null,
): MonacoEditorNS.languages.Location | MonacoEditorNS.languages.Location[] | null {
  const location = pickFirstLocation(raw)
  if (!location) return null

  const targetUri = monaco.Uri.file(location.absolutePath).toString()
  const range = new monaco.Range(
    location.line,
    location.column,
    location.line,
    location.column,
  )

  if (targetUri !== currentUri) {
    onGoToDefinition?.(location.absolutePath, location.line, location.column)
    return null
  }

  return {
    uri: monaco.Uri.file(location.absolutePath),
    range,
  }
}

function pickFirstLocation(raw: unknown): {
  relativePath: string
  absolutePath: string
  line: number
  column: number
} | null {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const uri =
      typeof rec.uri === 'string'
        ? rec.uri
        : typeof rec.targetUri === 'string'
          ? rec.targetUri
          : null
    if (!uri) continue
    const range = (rec.range ?? rec.targetSelectionRange ?? rec.targetRange) as
      | { start?: { line?: number; character?: number } }
      | undefined
    const line = (range?.start?.line ?? 0) + 1
    const column = (range?.start?.character ?? 0) + 1
    let absolutePath = uri
    if (uri.startsWith('file://')) {
      try {
        absolutePath = decodeURIComponent(uri.replace(/^file:\/\//, ''))
      } catch {
        absolutePath = uri.replace(/^file:\/\//, '')
      }
    }
    const normalized = absolutePath.replace(/\\/g, '/')
    const slash = normalized.lastIndexOf('/')
    const relativePath = slash >= 0 ? normalized.slice(slash + 1) : normalized
    return { relativePath, absolutePath: normalized, line, column }
  }
  return null
}

function normalizeCompletionItems(
  raw: unknown,
  model: MonacoEditorNS.ITextModel,
  position: MonacoEditorNS.Position,
): MonacoEditorNS.languages.CompletionItem[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)
      ? ((raw as { items: unknown[] }).items ?? [])
      : []

  return list.slice(0, 100).map((item, index) => {
    const rec = (item ?? {}) as Record<string, unknown>
    const label =
      typeof rec.label === 'string'
        ? rec.label
        : rec.label && typeof rec.label === 'object'
          ? String((rec.label as { label?: unknown }).label ?? '')
          : `item-${index}`
    const insertText =
      typeof rec.insertText === 'string'
        ? rec.insertText
        : typeof rec.label === 'string'
          ? rec.label
          : label
    const kind = mapCompletionKind(rec.kind)
    const range =
      rec.textEdit && typeof rec.textEdit === 'object'
        ? (rec.textEdit as { range?: MonacoEditorNS.IRange }).range
        : {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          }

    return {
      label,
      kind,
      insertText,
      range,
      detail: typeof rec.detail === 'string' ? rec.detail : undefined,
    } satisfies MonacoEditorNS.languages.CompletionItem
  })
}

function mapCompletionKind(kind: unknown): MonacoEditorNS.languages.CompletionItemKind {
  const value = typeof kind === 'number' ? kind : 1
  const table: MonacoEditorNS.languages.CompletionItemKind[] = [
    monaco.languages.CompletionItemKind.Text,
    monaco.languages.CompletionItemKind.Method,
    monaco.languages.CompletionItemKind.Function,
    monaco.languages.CompletionItemKind.Constructor,
    monaco.languages.CompletionItemKind.Field,
    monaco.languages.CompletionItemKind.Variable,
    monaco.languages.CompletionItemKind.Class,
    monaco.languages.CompletionItemKind.Interface,
    monaco.languages.CompletionItemKind.Module,
    monaco.languages.CompletionItemKind.Property,
    monaco.languages.CompletionItemKind.Unit,
    monaco.languages.CompletionItemKind.Value,
    monaco.languages.CompletionItemKind.Enum,
    monaco.languages.CompletionItemKind.Keyword,
    monaco.languages.CompletionItemKind.Snippet,
    monaco.languages.CompletionItemKind.Color,
    monaco.languages.CompletionItemKind.File,
    monaco.languages.CompletionItemKind.Reference,
    monaco.languages.CompletionItemKind.Folder,
    monaco.languages.CompletionItemKind.EnumMember,
    monaco.languages.CompletionItemKind.Constant,
    monaco.languages.CompletionItemKind.Struct,
    monaco.languages.CompletionItemKind.Event,
    monaco.languages.CompletionItemKind.Operator,
    monaco.languages.CompletionItemKind.TypeParameter,
  ]
  return table[value] ?? monaco.languages.CompletionItemKind.Text
}
