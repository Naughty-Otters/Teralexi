import type { editor as MonacoEditorNS } from 'monaco-editor'
import type { EditorAiCompletionSettings } from '@shared/editor/editor-ai-completion-settings'
import { extractFimContext } from '@shared/editor/fim-prompt'
import { monaco } from '../monaco-setup'

type EditorAiCompleteFn = (args: {
  prefix: string
  suffix: string
  languageId: string
  relativePath: string
}) => Promise<{ ok: boolean; completion?: string; error?: string }>

export class EditorAiCompletionController {
  private settings: EditorAiCompletionSettings | null = null
  private completeFn: EditorAiCompleteFn | null = null
  private relativePath: string | null = null
  private languageId = 'plaintext'
  private readOnly = false
  private editor: MonacoEditorNS.IStandaloneCodeEditor | null = null
  private providerDisposable: MonacoEditorNS.IDisposable | null = null
  private requestSeq = 0
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  configure(settings: EditorAiCompletionSettings): void {
    this.settings = settings
  }

  setCompleteFn(fn: EditorAiCompleteFn | null): void {
    this.completeFn = fn
  }

  attachEditor(
    editor: MonacoEditorNS.IStandaloneCodeEditor,
    options: {
      relativePath: string
      languageId: string
      readOnly?: boolean
    },
  ): void {
    this.detachProvider()
    this.editor = editor
    this.relativePath = options.relativePath
    this.languageId = options.languageId
    this.readOnly = options.readOnly ?? false

    if (!this.settings?.enabled || this.readOnly) return

    editor.updateOptions({
      inlineSuggest: {
        enabled: true,
        mode: 'prefix',
        showOnAllSymbols: true,
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
    })

    this.providerDisposable = monaco.languages.registerInlineCompletionsProvider(
      options.languageId,
      {
        provideInlineCompletions: (model, position, _context, token) =>
          this.provideInlineCompletions(model, position, token),
        disposeInlineCompletions: () => {},
      },
    )
  }

  private async provideInlineCompletions(
    model: MonacoEditorNS.ITextModel,
    position: MonacoEditorNS.Position,
    token: MonacoEditorNS.CancellationToken,
  ): Promise<MonacoEditorNS.languages.InlineCompletions | null> {
    if (this.disposed || !this.settings?.enabled || this.readOnly) return null
    if (!this.completeFn || !this.relativePath) return null
    if (model !== this.editor?.getModel()) return null

    const debounceMs = this.settings.debounceMs
    const seq = ++this.requestSeq

    await this.waitForDebounce(debounceMs, token)
    if (token.isCancellationRequested || seq !== this.requestSeq) return null

    const lines = model.getValue().split('\n')
    const { prefix, suffix } = extractFimContext(
      lines,
      position.lineNumber,
      position.column,
    )

    if (!prefix && !suffix) return null

    const result = await this.completeFn({
      prefix,
      suffix,
      languageId: this.languageId,
      relativePath: this.relativePath,
    })

    if (token.isCancellationRequested || seq !== this.requestSeq) return null
    if (!result.ok || !result.completion) return null

    return {
      items: [
        {
          insertText: result.completion,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        },
      ],
    }
  }

  private waitForDebounce(
    debounceMs: number,
    token: MonacoEditorNS.CancellationToken,
  ): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null
        resolve()
      }, debounceMs)

      if (token.isCancellationRequested) {
        clearTimeout(this.debounceTimer)
        this.debounceTimer = null
        resolve()
        return
      }

      token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer)
          this.debounceTimer = null
        }
        resolve()
      })
    })
  }

  private detachProvider(): void {
    this.requestSeq += 1
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.providerDisposable?.dispose()
    this.providerDisposable = null
  }

  dispose(): void {
    this.disposed = true
    this.detachProvider()
    this.editor = null
    this.relativePath = null
    this.completeFn = null
  }
}
