import { onScopeDispose, ref, type Ref } from 'vue'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import {
  DEFAULT_EDITOR_AI_COMPLETION_SETTINGS,
  EDITOR_AI_COMPLETION_SETTINGS_KEYS,
  parseEditorAiCompletionSettings,
  type EditorAiCompletionSettings,
} from '@shared/editor/editor-ai-completion-settings'
import { getSystemConfigValues } from '@store/agent/config'
import { EditorAiCompletionController } from './editor-ai-completion-controller'

export function useEditorAiCompletion(options: {
  conversationId: Ref<string | null>
  editorPath: Ref<string | null>
  readOnly: Ref<boolean>
}): {
  controller: EditorAiCompletionController
  aiCompletionSettings: Ref<EditorAiCompletionSettings>
  attachAiCompletion: (
    editor: MonacoEditorNS.IStandaloneCodeEditor,
    languageId: string,
  ) => Promise<void>
} {
  const controller = new EditorAiCompletionController()
  const aiCompletionSettings = ref<EditorAiCompletionSettings>({
    ...DEFAULT_EDITOR_AI_COMPLETION_SETTINGS,
  })

  void loadSettings()

  async function loadSettings(): Promise<void> {
    const values = await getSystemConfigValues([
      ...EDITOR_AI_COMPLETION_SETTINGS_KEYS,
    ])
    aiCompletionSettings.value = parseEditorAiCompletionSettings(values)
    controller.configure(aiCompletionSettings.value)
  }

  function ensureCompleteFn(relativePath: string): void {
    const conversationId = options.conversationId.value
    if (!conversationId) {
      controller.setCompleteFn(null)
      return
    }

    controller.setCompleteFn(({ prefix, suffix, languageId, relativePath: path }) =>
      window.ipcRendererChannel?.EditorAiComplete?.invoke?.({
        conversationId,
        prefix,
        suffix,
        languageId,
        relativePath: path,
      }) ?? Promise.resolve({ ok: false, error: 'IPC unavailable' }),
    )
  }

  async function attachAiCompletion(
    editor: MonacoEditorNS.IStandaloneCodeEditor,
    languageId: string,
  ): Promise<void> {
    const relativePath = options.editorPath.value
    if (!relativePath) return

    await loadSettings()
    ensureCompleteFn(relativePath)
    controller.attachEditor(editor, {
      relativePath,
      languageId,
      readOnly: options.readOnly.value,
    })
  }

  onScopeDispose(() => {
    controller.dispose()
  })

  return {
    controller,
    aiCompletionSettings,
    attachAiCompletion,
  }
}
