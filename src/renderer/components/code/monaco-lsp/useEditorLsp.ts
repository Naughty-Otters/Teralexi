import { ref, onScopeDispose, watch, type Ref } from 'vue'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import type { SharedLspDiagnostic } from '@shared/editor/diagnostic-types'
import {
  DEFAULT_EDITOR_SETTINGS,
  parseEditorSettings,
  EDITOR_SETTINGS_KEYS,
  type EditorSettings,
} from '@shared/editor/editor-settings'
import { monacoLanguageFromPath } from '@shared/file-type/monaco-language'
import { getSystemConfigValues } from '@store/agent/config'
import {
  EditorLspController,
  type EditorLspStatus,
} from './editor-lsp-controller'
import { registerBuiltInSnippets } from './snippets'

const LSP_SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.pyi',
  '.go',
  '.rs',
])

export function isEditorLspSupportedPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase()
  const dot = normalized.lastIndexOf('.')
  if (dot < 0) return false
  return LSP_SUPPORTED_EXTENSIONS.has(normalized.slice(dot))
}

export function useEditorLspSession(options: {
  conversationId: Ref<string | null>
  workspaceRoot: Ref<string | null>
  editorPath: Ref<string | null>
  editorContent: Ref<string>
  onOpenFile: (relativePath: string) => void
}): {
  controller: EditorLspController
  lspStatus: Ref<EditorLspStatus | null>
  editorSettings: Ref<EditorSettings>
  attachToEditor: (editor: MonacoEditorNS.IStandaloneCodeEditor) => void
  formatActiveFile: () => Promise<string | null>
} {
  const controller = new EditorLspController()
  const lspStatus = ref<EditorLspStatus | null>(null)
  const editorSettings = ref<EditorSettings>({ ...DEFAULT_EDITOR_SETTINGS })
  let sessionStarted = false
  let notificationListener: ((...args: unknown[]) => void) | null = null
  let statusUnsub: (() => void) | null = null

  registerBuiltInSnippets()

  void loadEditorSettings()

  async function loadEditorSettings(): Promise<void> {
    const values = await getSystemConfigValues([...EDITOR_SETTINGS_KEYS])
    editorSettings.value = parseEditorSettings(values)
    controller.configure({
      eslintEnabled: editorSettings.value.eslintEnabled,
      eslintDebounceMs: editorSettings.value.eslintDebounceMs,
    })
  }

  function ensureCallbacks(relativePath: string): void {
    const conversationId = options.conversationId.value
    if (!conversationId) return

    controller.setCallbacks({
      syncDocument: (content, languageId) => {
        void window.ipcRendererChannel?.EditorLspSyncDocument?.invoke?.({
          conversationId,
          relativePath,
          content,
          languageId,
        })
      },
      closeDocument: () => {
        void window.ipcRendererChannel?.EditorLspCloseDocument?.invoke?.({
          conversationId,
          relativePath,
        })
      },
      request: (method, params) =>
        window.ipcRendererChannel?.EditorLspRequest?.invoke?.({
          conversationId,
          relativePath,
          method,
          params,
        }) ?? Promise.resolve({ ok: false, error: 'IPC unavailable' }),
      lint: () =>
        window.ipcRendererChannel?.LintWorkspaceFile?.invoke?.({
          conversationId,
          relativePath,
          content: options.editorContent.value,
        }) ?? Promise.resolve({ ok: false, error: 'IPC unavailable' }),
      onGoToDefinition: (absolutePath, _line, _column) => {
        const workspaceRoot = options.workspaceRoot.value?.replace(/\\/g, '/')
        if (!workspaceRoot) return
        const normalizedAbs = absolutePath.replace(/\\/g, '/')
        const prefix = workspaceRoot.endsWith('/')
          ? workspaceRoot
          : `${workspaceRoot}/`
        if (!normalizedAbs.startsWith(prefix)) return
        const relativePath = normalizedAbs.slice(prefix.length)
        options.onOpenFile(relativePath)
      },
    })
  }

  async function ensureSession(): Promise<void> {
    const conversationId = options.conversationId.value
    if (!conversationId || sessionStarted) return

    const workspaceRoot = options.workspaceRoot.value?.trim()
    await window.ipcRendererChannel?.EditorLspStartSession?.invoke?.({
      conversationId,
      ...(workspaceRoot ? { workspaceRoot } : {}),
    })
    sessionStarted = true

    notificationListener = (payload: {
      conversationId?: string
      relativePath?: string
      method?: string
      params?: { diagnostics?: SharedLspDiagnostic[] }
    }) => {
      if (payload.conversationId !== conversationId) return
      if (payload.relativePath !== options.editorPath.value) return
      if (payload.method !== 'textDocument/publishDiagnostics') return
      controller.handleDiagnosticsNotification(payload.params?.diagnostics ?? [])
    }

    window.ipcRendererChannel?.EditorLspNotification?.on?.(notificationListener)
  }

  async function attachToEditor(editor: MonacoEditorNS.IStandaloneCodeEditor): Promise<void> {
    const relativePath = options.editorPath.value
    if (!relativePath) return

    try {
      await ensureSession()
      ensureCallbacks(relativePath)

      statusUnsub?.()
      statusUnsub = controller.onStatusChange((status) => {
        lspStatus.value = status
      })

      controller.attachEditor(editor, {
        relativePath,
        absoluteFilePath: options.workspaceRoot.value
          ? `${options.workspaceRoot.value.replace(/\\/g, '/').replace(/\/$/, '')}/${relativePath.replace(/\\/g, '/')}`
          : null,
        languageId: monacoLanguageFromPath(relativePath),
        lspSupported: isEditorLspSupportedPath(relativePath),
        content: options.editorContent.value,
      })
    } catch {
      // LSP is best-effort; never block the text editor from opening.
    }
  }

  async function formatActiveFile(): Promise<string | null> {
    const conversationId = options.conversationId.value
    const relativePath = options.editorPath.value
    if (!conversationId || !relativePath) return null

    const result = await window.ipcRendererChannel?.FormatWorkspaceFile?.invoke?.({
      conversationId,
      relativePath,
      content: options.editorContent.value,
    })
    if (!result?.ok || !result.content) return null
    return result.content
  }

  watch(editorPath, (newPath, oldPath) => {
    const conversationId = options.conversationId.value
    if (oldPath && conversationId) {
      void window.ipcRendererChannel?.EditorLspCloseDocument?.invoke?.({
        conversationId,
        relativePath: oldPath,
      })
    }
    if (newPath) {
      ensureCallbacks(newPath)
    }
  })

  onScopeDispose(() => {
    controller.dispose()
    statusUnsub?.()
    if (notificationListener) {
      window.ipcRendererChannel?.EditorLspNotification?.removeListener?.(
        notificationListener,
      )
    }
    const conversationId = options.conversationId.value
    if (conversationId && sessionStarted) {
      void window.ipcRendererChannel?.EditorLspStopSession?.invoke?.({
        conversationId,
      })
    }
  })

  return {
    controller,
    lspStatus,
    editorSettings,
    attachToEditor,
    formatActiveFile,
  }
}
