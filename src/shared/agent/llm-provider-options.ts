import type { ProviderType } from './llm-provider-registry'

/**
 * AI SDK `providerOptions` bag: namespaced by the underlying SDK provider id
 * (e.g. `{ google: { thinkingConfig: ... } }`, not OpenFDE's `gemini`).
 */
export type AgentLlmProviderOptions = Record<string, Record<string, unknown>>

/**
 * Maps OpenFDE provider ids to the namespace AI SDK expects in `providerOptions`.
 * Must match the factory `name` / SDK id used in `createModelForProvider`.
 */
export const AI_SDK_PROVIDER_OPTIONS_NAMESPACE: Record<ProviderType, string> = {
  ollama: 'ollama',
  llamacpp: 'llamacpp',
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'google',
  deepseek: 'deepseek',
  xai: 'xai',
  zhipu: 'zhipu',
  moonshot: 'moonshotai',
  qwen: 'alibaba',
  bytedance: 'bytedance',
  huggingface: 'huggingface',
  'nvidia-nim': 'nvidia-nim',
  fireworks: 'fireworks',
  openrouter: 'openrouter',
  togetherai: 'togetherai',
  groq: 'groq',
  deepinfra: 'deepinfra',
  custom: 'custom',
}

/** Private UI round-trip bag stored inside a provider options slice. */
export const OPENFDE_REASONING_UI_KEY = '_openfdeReasoning'

export type LlmReasoningLevel =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type LlmReasoningUiValues = {
  level?: LlmReasoningLevel
  includeThoughts?: boolean
  thinkingBudget?: number
}

/** Which SDK property receives the shared level control. */
export type LlmReasoningLevelProperty =
  | 'reasoningEffort'
  | 'thinkingLevel'
  | 'effort'

export type LlmReasoningProviderProfile = {
  levelProperty: LlmReasoningLevelProperty
  levelValues: readonly LlmReasoningLevel[]
  /** How to write thinkingBudget for this provider. */
  budgetStyle: 'googleThinkingConfig' | 'anthropicThinking' | 'none'
  /** How to write includeThoughts for this provider. */
  includeThoughtsStyle: 'googleThinkingConfig' | 'ollamaThink' | 'none'
}

const OPENAI_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const satisfies readonly LlmReasoningLevel[]

const GEMINI_LEVELS = [
  'minimal',
  'low',
  'medium',
  'high',
] as const satisfies readonly LlmReasoningLevel[]

const DEEPSEEK_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly LlmReasoningLevel[]

const XAI_LEVELS = [
  'none',
  'low',
  'medium',
  'high',
] as const satisfies readonly LlmReasoningLevel[]

const ANTHROPIC_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly LlmReasoningLevel[]

const DEFAULT_OPENAI_PROFILE: LlmReasoningProviderProfile = {
  levelProperty: 'reasoningEffort',
  levelValues: OPENAI_LEVELS,
  budgetStyle: 'none',
  includeThoughtsStyle: 'none',
}

const REASONING_PROVIDER_PROFILES: Record<
  ProviderType,
  LlmReasoningProviderProfile
> = {
  openai: DEFAULT_OPENAI_PROFILE,
  gemini: {
    levelProperty: 'thinkingLevel',
    levelValues: GEMINI_LEVELS,
    budgetStyle: 'googleThinkingConfig',
    includeThoughtsStyle: 'googleThinkingConfig',
  },
  anthropic: {
    levelProperty: 'effort',
    levelValues: ANTHROPIC_LEVELS,
    budgetStyle: 'anthropicThinking',
    includeThoughtsStyle: 'none',
  },
  deepseek: {
    levelProperty: 'reasoningEffort',
    levelValues: DEEPSEEK_LEVELS,
    budgetStyle: 'none',
    includeThoughtsStyle: 'none',
  },
  xai: {
    levelProperty: 'reasoningEffort',
    levelValues: XAI_LEVELS,
    budgetStyle: 'none',
    includeThoughtsStyle: 'none',
  },
  groq: DEFAULT_OPENAI_PROFILE,
  ollama: {
    levelProperty: 'reasoningEffort',
    levelValues: OPENAI_LEVELS,
    budgetStyle: 'none',
    includeThoughtsStyle: 'ollamaThink',
  },
  llamacpp: DEFAULT_OPENAI_PROFILE,
  zhipu: DEFAULT_OPENAI_PROFILE,
  moonshot: DEFAULT_OPENAI_PROFILE,
  qwen: DEFAULT_OPENAI_PROFILE,
  bytedance: DEFAULT_OPENAI_PROFILE,
  huggingface: DEFAULT_OPENAI_PROFILE,
  'nvidia-nim': DEFAULT_OPENAI_PROFILE,
  fireworks: DEFAULT_OPENAI_PROFILE,
  openrouter: DEFAULT_OPENAI_PROFILE,
  togetherai: DEFAULT_OPENAI_PROFILE,
  deepinfra: DEFAULT_OPENAI_PROFILE,
  custom: DEFAULT_OPENAI_PROFILE,
}

export function aiSdkProviderOptionsNamespace(
  provider: ProviderType,
): string {
  return AI_SDK_PROVIDER_OPTIONS_NAMESPACE[provider]
}

export function reasoningProviderProfile(
  provider: ProviderType,
): LlmReasoningProviderProfile {
  return REASONING_PROVIDER_PROFILES[provider]
}

export function parseProviderOptions(
  value: unknown,
): AgentLlmProviderOptions | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const out: AgentLlmProviderOptions = {}
  for (const [namespace, options] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!namespace.trim()) continue
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      continue
    }
    out[namespace] = { ...(options as Record<string, unknown>) }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function isEmptyProviderOptions(
  value: AgentLlmProviderOptions | undefined,
): boolean {
  return !value || Object.keys(value).length === 0
}

function isReasoningLevel(value: unknown): value is LlmReasoningLevel {
  return (
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  )
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function isEmptyReasoningUi(values: LlmReasoningUiValues | undefined): boolean {
  if (!values) return true
  return (
    values.level == null &&
    values.includeThoughts == null &&
    values.thinkingBudget == null
  )
}

/** Strip private UI keys from a provider options bag before sending to AI SDK. */
export function stripPrivateProviderOptionKeys(
  slice: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(slice)) {
    if (key === OPENFDE_REASONING_UI_KEY) continue
    out[key] = value
  }
  return out
}

/** Value for AI SDK call sites; omits empty bags and private UI keys. */
export function resolveAiSdkProviderOptions(
  providerOptions: AgentLlmProviderOptions | undefined,
): AgentLlmProviderOptions | undefined {
  if (isEmptyProviderOptions(providerOptions)) return undefined
  const out: AgentLlmProviderOptions = {}
  for (const [namespace, slice] of Object.entries(providerOptions!)) {
    const cleaned = stripPrivateProviderOptionKeys(slice)
    if (Object.keys(cleaned).length > 0) out[namespace] = cleaned
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Read the options slice for an OpenFDE provider (SDK namespace). */
export function getProviderOptionsSlice(
  providerOptions: AgentLlmProviderOptions | undefined,
  provider: ProviderType,
): Record<string, unknown> | undefined {
  if (!providerOptions) return undefined
  const ns = aiSdkProviderOptionsNamespace(provider)
  const slice = providerOptions[ns]
  return slice && Object.keys(slice).length > 0 ? { ...slice } : undefined
}

/**
 * Replace the active provider's SDK namespace slice. Clears all namespaces when
 * the slice is empty so leftovers from a previous provider do not leak.
 */
export function setProviderOptionsSlice(
  provider: ProviderType,
  slice: Record<string, unknown> | undefined,
): AgentLlmProviderOptions | undefined {
  if (!slice || Object.keys(slice).length === 0) return undefined
  return { [aiSdkProviderOptionsNamespace(provider)]: { ...slice } }
}

function readReasoningUiFromSdkSlice(
  provider: ProviderType,
  slice: Record<string, unknown> | undefined,
): LlmReasoningUiValues {
  if (!slice) return {}
  const profile = reasoningProviderProfile(provider)
  const values: LlmReasoningUiValues = {}

  if (profile.levelProperty === 'thinkingLevel') {
    const thinking = asRecord(slice.thinkingConfig)
    if (isReasoningLevel(thinking?.thinkingLevel)) {
      values.level = thinking.thinkingLevel
    }
  } else if (isReasoningLevel(slice[profile.levelProperty])) {
    values.level = slice[profile.levelProperty] as LlmReasoningLevel
  }

  if (profile.includeThoughtsStyle === 'googleThinkingConfig') {
    const thinking = asRecord(slice.thinkingConfig)
    if (typeof thinking?.includeThoughts === 'boolean') {
      values.includeThoughts = thinking.includeThoughts
    }
  } else if (profile.includeThoughtsStyle === 'ollamaThink') {
    if (typeof slice.think === 'boolean') values.includeThoughts = slice.think
  }

  if (profile.budgetStyle === 'googleThinkingConfig') {
    const thinking = asRecord(slice.thinkingConfig)
    if (typeof thinking?.thinkingBudget === 'number') {
      values.thinkingBudget = thinking.thinkingBudget
    }
  } else if (profile.budgetStyle === 'anthropicThinking') {
    const thinking = asRecord(slice.thinking)
    if (
      thinking?.type === 'enabled' &&
      typeof thinking.budgetTokens === 'number'
    ) {
      values.thinkingBudget = thinking.budgetTokens
    }
  }

  return values
}

/** Read shared reasoning controls from a provider options bag. */
export function readReasoningUiValues(
  provider: ProviderType,
  providerOptions: AgentLlmProviderOptions | undefined,
): LlmReasoningUiValues {
  const slice = getProviderOptionsSlice(providerOptions, provider)
  const stored = asRecord(slice?.[OPENFDE_REASONING_UI_KEY])
  if (stored) {
    const values: LlmReasoningUiValues = {}
    if (isReasoningLevel(stored.level)) values.level = stored.level
    if (typeof stored.includeThoughts === 'boolean') {
      values.includeThoughts = stored.includeThoughts
    }
    if (typeof stored.thinkingBudget === 'number') {
      values.thinkingBudget = stored.thinkingBudget
    }
    if (!isEmptyReasoningUi(values)) return values
  }
  return readReasoningUiFromSdkSlice(provider, slice)
}

function clearMappedReasoningKeys(
  provider: ProviderType,
  slice: Record<string, unknown>,
): void {
  const profile = reasoningProviderProfile(provider)
  delete slice.reasoningEffort
  delete slice.thinkingLevel
  delete slice.effort
  delete slice.think

  if (
    profile.budgetStyle === 'googleThinkingConfig' ||
    profile.includeThoughtsStyle === 'googleThinkingConfig' ||
    profile.levelProperty === 'thinkingLevel'
  ) {
    delete slice.thinkingConfig
  }
  if (profile.budgetStyle === 'anthropicThinking') {
    delete slice.thinking
  }
}

function applyReasoningUiToSdkSlice(
  provider: ProviderType,
  slice: Record<string, unknown>,
  values: LlmReasoningUiValues,
): void {
  const profile = reasoningProviderProfile(provider)
  clearMappedReasoningKeys(provider, slice)

  if (values.level) {
    if (profile.levelProperty === 'thinkingLevel') {
      const thinking = asRecord(slice.thinkingConfig) ?? {}
      thinking.thinkingLevel = values.level
      slice.thinkingConfig = thinking
    } else {
      slice[profile.levelProperty] = values.level
    }
  }

  if (values.includeThoughts != null) {
    if (profile.includeThoughtsStyle === 'googleThinkingConfig') {
      const thinking = asRecord(slice.thinkingConfig) ?? {}
      thinking.includeThoughts = values.includeThoughts
      slice.thinkingConfig = thinking
    } else if (profile.includeThoughtsStyle === 'ollamaThink') {
      slice.think = values.includeThoughts
    }
  }

  if (values.thinkingBudget != null) {
    if (profile.budgetStyle === 'googleThinkingConfig') {
      const thinking = asRecord(slice.thinkingConfig) ?? {}
      thinking.thinkingBudget = values.thinkingBudget
      slice.thinkingConfig = thinking
    } else if (profile.budgetStyle === 'anthropicThinking') {
      slice.thinking = {
        type: 'enabled',
        budgetTokens: values.thinkingBudget,
      }
    }
  }
}

/**
 * Write shared reasoning UI values into providerOptions for the active provider.
 * Keeps a private UI bag for round-trip and expands provider-specific SDK keys.
 */
export function writeReasoningUiValues(
  provider: ProviderType,
  providerOptions: AgentLlmProviderOptions | undefined,
  values: LlmReasoningUiValues,
): AgentLlmProviderOptions | undefined {
  const existing = getProviderOptionsSlice(providerOptions, provider) ?? {}
  const nextSlice: Record<string, unknown> = { ...existing }
  delete nextSlice[OPENFDE_REASONING_UI_KEY]
  clearMappedReasoningKeys(provider, nextSlice)

  if (isEmptyReasoningUi(values)) {
    return setProviderOptionsSlice(
      provider,
      Object.keys(nextSlice).length > 0 ? nextSlice : undefined,
    )
  }

  const stored: LlmReasoningUiValues = {}
  if (values.level) stored.level = values.level
  if (values.includeThoughts != null) {
    stored.includeThoughts = values.includeThoughts
  }
  if (values.thinkingBudget != null) {
    stored.thinkingBudget = values.thinkingBudget
  }
  nextSlice[OPENFDE_REASONING_UI_KEY] = stored
  applyReasoningUiToSdkSlice(provider, nextSlice, values)
  return setProviderOptionsSlice(provider, nextSlice)
}
