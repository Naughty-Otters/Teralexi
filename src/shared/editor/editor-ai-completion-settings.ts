import {
  isProviderType,
  type ProviderType,
} from '@shared/agent/llm-provider-registry'

export const EDITOR_AI_COMPLETION_PROP_KEYS = {
  enabled: 'editor.settings.aiCompletionEnabled',
  provider: 'editor.settings.aiCompletionProvider',
  model: 'editor.settings.aiCompletionModel',
  debounceMs: 'editor.settings.aiCompletionDebounceMs',
  maxTokens: 'editor.settings.aiCompletionMaxTokens',
} as const

export const EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS = [
  'ollama',
  'llamacpp',
  'openai',
  'deepseek',
  'qwen',
  'moonshot',
] as const satisfies readonly ProviderType[]

export type EditorAiCompletionProvider =
  (typeof EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS)[number]

export type EditorAiCompletionSettings = {
  enabled: boolean
  provider: EditorAiCompletionProvider
  model: string
  debounceMs: number
  maxTokens: number
}

export const DEFAULT_EDITOR_AI_COMPLETION_SETTINGS: EditorAiCompletionSettings = {
  enabled: false,
  provider: 'ollama',
  model: '',
  debounceMs: 500,
  maxTokens: 128,
}

const DEFAULT_MODEL_BY_PROVIDER: Record<EditorAiCompletionProvider, string> = {
  ollama: 'qwen2.5-coder:7b',
  llamacpp: 'local-model',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-coder',
  qwen: 'qwen2.5-coder-7b-instruct',
  moonshot: 'moonshot-v1-8k',
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

export function parseEditorAiCompletionProvider(
  value: string | undefined,
): EditorAiCompletionProvider {
  const normalized = value?.trim()
  if (
    normalized &&
    isProviderType(normalized) &&
    (EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS as readonly string[]).includes(
      normalized,
    )
  ) {
    return normalized as EditorAiCompletionProvider
  }
  return DEFAULT_EDITOR_AI_COMPLETION_SETTINGS.provider
}

export function resolveEditorAiCompletionModel(
  settings: Pick<EditorAiCompletionSettings, 'provider' | 'model'>,
): string {
  const trimmed = settings.model.trim()
  if (trimmed) return trimmed
  return DEFAULT_MODEL_BY_PROVIDER[settings.provider]
}

export function parseEditorAiCompletionSettings(
  values: Record<string, string | undefined>,
): EditorAiCompletionSettings {
  return {
    enabled: parseBoolean(
      values[EDITOR_AI_COMPLETION_PROP_KEYS.enabled],
      DEFAULT_EDITOR_AI_COMPLETION_SETTINGS.enabled,
    ),
    provider: parseEditorAiCompletionProvider(
      values[EDITOR_AI_COMPLETION_PROP_KEYS.provider],
    ),
    model: values[EDITOR_AI_COMPLETION_PROP_KEYS.model]?.trim() ?? '',
    debounceMs: parsePositiveInt(
      values[EDITOR_AI_COMPLETION_PROP_KEYS.debounceMs],
      DEFAULT_EDITOR_AI_COMPLETION_SETTINGS.debounceMs,
    ),
    maxTokens: parsePositiveInt(
      values[EDITOR_AI_COMPLETION_PROP_KEYS.maxTokens],
      DEFAULT_EDITOR_AI_COMPLETION_SETTINGS.maxTokens,
    ),
  }
}

export const EDITOR_AI_COMPLETION_SETTINGS_KEYS = Object.values(
  EDITOR_AI_COMPLETION_PROP_KEYS,
)
