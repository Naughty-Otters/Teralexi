import {
  EDITOR_AI_COMPLETION_PROP_KEYS,
  type EditorAiCompletionSettings,
} from '@shared/editor/editor-ai-completion-settings'
import { setSystemConfigValue } from '@store/agent/config'

function serializeEditorAiCompletionSetting(
  key: keyof EditorAiCompletionSettings,
  value: EditorAiCompletionSettings[keyof EditorAiCompletionSettings],
): string {
  if (key === 'enabled') return value ? 'true' : 'false'
  return String(value)
}

export async function persistEditorAiCompletionSettings(
  settings: EditorAiCompletionSettings,
): Promise<void> {
  const keys = Object.keys(EDITOR_AI_COMPLETION_PROP_KEYS) as Array<
    keyof EditorAiCompletionSettings
  >
  await Promise.all(
    keys.map((key) =>
      setSystemConfigValue(
        EDITOR_AI_COMPLETION_PROP_KEYS[key],
        serializeEditorAiCompletionSetting(key, settings[key]),
      ),
    ),
  )
}
