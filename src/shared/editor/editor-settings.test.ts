import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_SETTINGS,
  parseEditorSettings,
  EDITOR_SETTINGS_PROP_KEYS,
} from '@shared/editor/editor-settings'

describe('editor-settings', () => {
  it('parses stored editor settings with defaults', () => {
    const parsed = parseEditorSettings({
      [EDITOR_SETTINGS_PROP_KEYS.formatOnSave]: 'true',
      [EDITOR_SETTINGS_PROP_KEYS.tabSize]: '4',
      [EDITOR_SETTINGS_PROP_KEYS.insertSpaces]: 'false',
      [EDITOR_SETTINGS_PROP_KEYS.eslintEnabled]: 'true',
      [EDITOR_SETTINGS_PROP_KEYS.eslintDebounceMs]: '750',
    })

    expect(parsed).toEqual({
      formatOnSave: true,
      tabSize: 4,
      insertSpaces: false,
      eslintEnabled: true,
      eslintDebounceMs: 750,
    })
  })

  it('falls back to defaults for invalid values', () => {
    expect(parseEditorSettings({})).toEqual(DEFAULT_EDITOR_SETTINGS)
  })

  it('handles invalid parser input by returning defaults', () => {
    const parsed = parseEditorSettings({
      [EDITOR_SETTINGS_PROP_KEYS.tabSize]: 'not-a-number',
      [EDITOR_SETTINGS_PROP_KEYS.formatOnSave]: 'maybe',
    })
    expect(parsed.tabSize).toBe(DEFAULT_EDITOR_SETTINGS.tabSize)
    expect(parsed.formatOnSave).toBe(DEFAULT_EDITOR_SETTINGS.formatOnSave)
  })
})
