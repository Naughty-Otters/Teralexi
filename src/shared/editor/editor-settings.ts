export const EDITOR_SETTINGS_PROP_KEYS = {
  formatOnSave: 'editor.settings.formatOnSave',
  tabSize: 'editor.settings.tabSize',
  insertSpaces: 'editor.settings.insertSpaces',
  eslintEnabled: 'editor.settings.eslintEnabled',
  eslintDebounceMs: 'editor.settings.eslintDebounceMs',
} as const

export type EditorSettings = {
  formatOnSave: boolean
  tabSize: number
  insertSpaces: boolean
  eslintEnabled: boolean
  eslintDebounceMs: number
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  formatOnSave: false,
  tabSize: 2,
  insertSpaces: true,
  eslintEnabled: true,
  eslintDebounceMs: 500,
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return fallback
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

export function parseEditorSettings(
  values: Record<string, string | undefined>,
): EditorSettings {
  return {
    formatOnSave: parseBoolean(
      values[EDITOR_SETTINGS_PROP_KEYS.formatOnSave],
      DEFAULT_EDITOR_SETTINGS.formatOnSave,
    ),
    tabSize: parsePositiveInt(
      values[EDITOR_SETTINGS_PROP_KEYS.tabSize],
      DEFAULT_EDITOR_SETTINGS.tabSize,
    ),
    insertSpaces: parseBoolean(
      values[EDITOR_SETTINGS_PROP_KEYS.insertSpaces],
      DEFAULT_EDITOR_SETTINGS.insertSpaces,
    ),
    eslintEnabled: parseBoolean(
      values[EDITOR_SETTINGS_PROP_KEYS.eslintEnabled],
      DEFAULT_EDITOR_SETTINGS.eslintEnabled,
    ),
    eslintDebounceMs: parsePositiveInt(
      values[EDITOR_SETTINGS_PROP_KEYS.eslintDebounceMs],
      DEFAULT_EDITOR_SETTINGS.eslintDebounceMs,
    ),
  }
}

export const EDITOR_SETTINGS_KEYS = Object.values(EDITOR_SETTINGS_PROP_KEYS)

export { EDITOR_AI_COMPLETION_SETTINGS_KEYS } from './editor-ai-completion-settings'
