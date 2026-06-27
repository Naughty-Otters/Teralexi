import { describe, expect, it } from 'vitest'
import {
  parseEditorAiCompletionSettings,
  resolveEditorAiCompletionModel,
} from './editor-ai-completion-settings'

describe('editor-ai-completion-settings', () => {
  it('parses stored editor AI completion settings', () => {
    expect(
      parseEditorAiCompletionSettings({
        'editor.settings.aiCompletionEnabled': 'true',
        'editor.settings.aiCompletionProvider': 'deepseek',
        'editor.settings.aiCompletionModel': 'deepseek-coder',
        'editor.settings.aiCompletionDebounceMs': '700',
        'editor.settings.aiCompletionMaxTokens': '96',
      }),
    ).toEqual({
      enabled: true,
      provider: 'deepseek',
      model: 'deepseek-coder',
      debounceMs: 700,
      maxTokens: 96,
    })
  })

  it('falls back to provider defaults for blank model names', () => {
    expect(
      resolveEditorAiCompletionModel({ provider: 'ollama', model: '' }),
    ).toBe('qwen2.5-coder:7b')
    expect(
      resolveEditorAiCompletionModel({
        provider: 'deepseek',
        model: 'custom-model',
      }),
    ).toBe('custom-model')
  })
})
