/** Canonical LLM provider ids used by agents, skills, and settings. */

export const LLM_PROVIDER_IDS = [
  'ollama',
  'llamacpp',
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'zhipu',
  'moonshot',
  'qwen',
  'bytedance',
  'huggingface',
  'nvidia-nim',
  'fireworks',
  'openrouter',
  'togetherai',
  'groq',
  'deepinfra',
  'custom',
] as const

export type ProviderType = (typeof LLM_PROVIDER_IDS)[number]

/** Skill properties.md provider field — same set as agent providers. */
export type SkillProvider = ProviderType

export type LlmProviderCategory = 'local' | 'vendor' | 'wholesale'

export const LOCAL_LLM_PROVIDER_IDS = ['ollama', 'llamacpp'] as const satisfies readonly ProviderType[]

export const VENDOR_LLM_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'zhipu',
  'moonshot',
  'qwen',
  'bytedance',
  'huggingface',
  'nvidia-nim',
] as const satisfies readonly ProviderType[]

export const WHOLESALE_LLM_PROVIDER_IDS = [
  'fireworks',
  'openrouter',
  'togetherai',
  'groq',
  'deepinfra',
  'custom',
] as const satisfies readonly ProviderType[]

/** Signed-in users can configure vendor + wholesale APIs. */
export const CLOUD_LLM_PROVIDER_IDS = [
  ...VENDOR_LLM_PROVIDER_IDS,
  ...WHOLESALE_LLM_PROVIDER_IDS,
] as const satisfies readonly ProviderType[]

export type ApiKeyBaseUrlProviderId =
  | 'moonshot'
  | 'qwen'
  | 'bytedance'
  | 'huggingface'
  | 'nvidia-nim'
  | 'fireworks'
  | 'openrouter'
  | 'togetherai'
  | 'groq'
  | 'deepinfra'
  | 'custom'

/** @deprecated Use {@link ApiKeyBaseUrlProviderId}. */
export type OpenAiCompatibleProviderId = ApiKeyBaseUrlProviderId

export type ApiKeyBaseUrlProviderMeta = {
  id: ApiKeyBaseUrlProviderId
  label: string
  category: LlmProviderCategory
  apiKeyConfigKey: string
  baseUrlConfigKey: string
  defaultBaseUrl: string
  defaultModels: readonly string[]
  hint: string
}

/** @deprecated Use {@link ApiKeyBaseUrlProviderMeta}. */
export type OpenAiCompatibleProviderMeta = ApiKeyBaseUrlProviderMeta

export const API_KEY_BASE_URL_LLM_PROVIDERS: Record<
  ApiKeyBaseUrlProviderId,
  ApiKeyBaseUrlProviderMeta
> = {
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot',
    category: 'vendor',
    apiKeyConfigKey: 'settings.moonshot.apiKey',
    baseUrlConfigKey: 'settings.moonshot.baseUrl',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    defaultModels: [
      'kimi-k2-turbo-preview',
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
    ],
    hint: 'Moonshot (Kimi) OpenAI-compatible API. Models include kimi-k2 and moonshot-v1 variants.',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    category: 'vendor',
    apiKeyConfigKey: 'settings.qwen.apiKey',
    baseUrlConfigKey: 'settings.qwen.baseUrl',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen3-max'],
    hint: 'Alibaba Qwen via DashScope compatible-mode. Use your DashScope API key.',
  },
  bytedance: {
    id: 'bytedance',
    label: 'ByteDance',
    category: 'vendor',
    apiKeyConfigKey: 'settings.bytedance.apiKey',
    baseUrlConfigKey: 'settings.bytedance.baseUrl',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModels: [],
    hint:
      'Volcengine Ark (Doubao). Use your endpoint model id from the Ark console as the agent model name.',
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face',
    category: 'vendor',
    apiKeyConfigKey: 'settings.huggingface.apiKey',
    baseUrlConfigKey: 'settings.huggingface.baseUrl',
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    defaultModels: [],
    hint:
      'Hugging Face Inference router (OpenAI-compatible). Use provider/model ids from Hugging Face.',
  },
  'nvidia-nim': {
    id: 'nvidia-nim',
    label: 'NVIDIA NIM',
    category: 'vendor',
    apiKeyConfigKey: 'settings.nvidiaNim.apiKey',
    baseUrlConfigKey: 'settings.nvidiaNim.baseUrl',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModels: [],
    hint: 'NVIDIA NIM OpenAI-compatible API. Model list loads from /models when configured.',
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks',
    category: 'wholesale',
    apiKeyConfigKey: 'settings.fireworks.apiKey',
    baseUrlConfigKey: 'settings.fireworks.baseUrl',
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModels: [
      'accounts/fireworks/models/llama-v3p1-70b-instruct',
      'accounts/fireworks/models/deepseek-v3',
    ],
    hint: 'Fireworks AI wholesale inference. Use model ids from the Fireworks console.',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    category: 'wholesale',
    apiKeyConfigKey: 'settings.openrouter.apiKey',
    baseUrlConfigKey: 'settings.openrouter.baseUrl',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModels: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro'],
    hint: 'OpenRouter routes requests to many hosted models. Use provider/model ids from openrouter.ai.',
  },
  togetherai: {
    id: 'togetherai',
    label: 'Together AI',
    category: 'wholesale',
    apiKeyConfigKey: 'settings.togetherai.apiKey',
    baseUrlConfigKey: 'settings.togetherai.baseUrl',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModels: [
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'deepseek-ai/DeepSeek-V3',
    ],
    hint: 'Together AI wholesale inference. Use model ids from the Together model catalog.',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    category: 'wholesale',
    apiKeyConfigKey: 'settings.groq.apiKey',
    baseUrlConfigKey: 'settings.groq.baseUrl',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    hint: 'Groq LPU inference API. Use model ids from the Groq console.',
  },
  deepinfra: {
    id: 'deepinfra',
    label: 'DeepInfra',
    category: 'wholesale',
    apiKeyConfigKey: 'settings.deepinfra.apiKey',
    baseUrlConfigKey: 'settings.deepinfra.baseUrl',
    defaultBaseUrl: 'https://api.deepinfra.com/v1',
    defaultModels: [
      'meta-llama/Meta-Llama-3.1-70B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
    ],
    hint: 'DeepInfra hosted inference. Use model ids from the DeepInfra model catalog.',
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    category: 'wholesale',
    apiKeyConfigKey: 'settings.custom.apiKey',
    baseUrlConfigKey: 'settings.custom.baseUrl',
    defaultBaseUrl: '',
    defaultModels: [],
    hint:
      'Any other OpenAI-compatible API. Browse providers and model ids on models.dev; paste your API key and base URL.',
  },
}

/** @deprecated Use {@link API_KEY_BASE_URL_LLM_PROVIDERS}. */
export const OPENAI_COMPATIBLE_LLM_PROVIDERS = API_KEY_BASE_URL_LLM_PROVIDERS

export const API_KEY_BASE_URL_PROVIDER_IDS = Object.keys(
  API_KEY_BASE_URL_LLM_PROVIDERS,
) as ApiKeyBaseUrlProviderId[]

/** @deprecated Use {@link API_KEY_BASE_URL_PROVIDER_IDS}. */
export const OPENAI_COMPATIBLE_PROVIDER_IDS = API_KEY_BASE_URL_PROVIDER_IDS

export const LLM_PROVIDER_LABELS: Record<ProviderType, string> = {
  ollama: 'Ollama',
  llamacpp: 'llama.cpp',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  zhipu: 'Zhipu GLM',
  moonshot: 'Moonshot',
  qwen: 'Qwen',
  bytedance: 'ByteDance',
  huggingface: 'Hugging Face',
  'nvidia-nim': 'NVIDIA NIM',
  fireworks: 'Fireworks',
  openrouter: 'OpenRouter',
  togetherai: 'Together AI',
  groq: 'Groq',
  deepinfra: 'DeepInfra',
  custom: 'Custom (OpenAI-compatible)',
}

export function llmProviderCategory(id: ProviderType): LlmProviderCategory {
  if ((LOCAL_LLM_PROVIDER_IDS as readonly string[]).includes(id)) return 'local'
  if ((WHOLESALE_LLM_PROVIDER_IDS as readonly string[]).includes(id)) return 'wholesale'
  return 'vendor'
}

/** Canonical provider label for settings tabs and dropdowns. */
export function llmProviderSettingsLabel(id: ProviderType): string {
  if (id === 'ollama') return 'Ollama (local)'
  if (id === 'llamacpp') return 'llama.cpp (local)'
  const category = llmProviderCategory(id)
  if (category === 'wholesale') return `${LLM_PROVIDER_LABELS[id]} (wholesale)`
  return LLM_PROVIDER_LABELS[id]
}

export const LLM_PROVIDER_SETTINGS_OPTIONS = LLM_PROVIDER_IDS.map((id) => ({
  id,
  label: llmProviderSettingsLabel(id),
}))

export function isApiKeyBaseUrlProvider(
  provider: ProviderType,
): provider is ApiKeyBaseUrlProviderId {
  return provider in API_KEY_BASE_URL_LLM_PROVIDERS
}

/** @deprecated Use {@link isApiKeyBaseUrlProvider}. */
export function isOpenAiCompatibleProvider(
  provider: ProviderType,
): provider is ApiKeyBaseUrlProviderId {
  return isApiKeyBaseUrlProvider(provider)
}

export function isProviderType(value: string): value is ProviderType {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value)
}

export function normalizeProviderBaseUrl(
  url: string,
  fallback: string,
): string {
  const value = url.trim()
  if (!value) return fallback
  return value.replace(/\/$/, '')
}

export function apiKeyBaseUrlProviderMeta(
  provider: ApiKeyBaseUrlProviderId,
): ApiKeyBaseUrlProviderMeta {
  return API_KEY_BASE_URL_LLM_PROVIDERS[provider]
}

/** @deprecated Use {@link apiKeyBaseUrlProviderMeta}. */
export function openAiCompatibleProviderMeta(
  provider: ApiKeyBaseUrlProviderId,
): ApiKeyBaseUrlProviderMeta {
  return apiKeyBaseUrlProviderMeta(provider)
}

export function resolveApiKeyBaseUrlCredentials(
  provider: ApiKeyBaseUrlProviderId,
  values: Record<string, string | undefined>,
): { apiKey: string; baseURL: string } {
  const meta = API_KEY_BASE_URL_LLM_PROVIDERS[provider]
  return {
    apiKey: (values[meta.apiKeyConfigKey] ?? '').trim(),
    baseURL: normalizeProviderBaseUrl(
      values[meta.baseUrlConfigKey] ?? '',
      meta.defaultBaseUrl,
    ),
  }
}

/** @deprecated Use {@link resolveApiKeyBaseUrlCredentials}. */
export function resolveOpenAiCompatibleCredentials(
  provider: ApiKeyBaseUrlProviderId,
  values: Record<string, string | undefined>,
): { apiKey: string; baseURL: string } {
  return resolveApiKeyBaseUrlCredentials(provider, values)
}

export function apiKeyBaseUrlProviderConfigKeys(): string[] {
  return API_KEY_BASE_URL_PROVIDER_IDS.flatMap((id) => {
    const meta = API_KEY_BASE_URL_LLM_PROVIDERS[id]
    return [meta.apiKeyConfigKey, meta.baseUrlConfigKey]
  })
}

/** @deprecated Use {@link apiKeyBaseUrlProviderConfigKeys}. */
export function openAiCompatibleProviderConfigKeys(): string[] {
  return apiKeyBaseUrlProviderConfigKeys()
}

/** SQL CHECK list for agent_configurations.provider */
export const AGENT_PROVIDER_SQL_CHECK = `(${LLM_PROVIDER_IDS.map((id) => `'${id}'`).join(', ')})`

export function emptyApiKeyBaseUrlCredentials(): Record<
  ApiKeyBaseUrlProviderId,
  { apiKey: string; baseURL: string }
> {
  const out = {} as Record<
    ApiKeyBaseUrlProviderId,
    { apiKey: string; baseURL: string }
  >
  for (const id of API_KEY_BASE_URL_PROVIDER_IDS) {
    const meta = API_KEY_BASE_URL_LLM_PROVIDERS[id]
    out[id] = { apiKey: '', baseURL: meta.defaultBaseUrl }
  }
  return out
}

/** @deprecated Use {@link emptyApiKeyBaseUrlCredentials}. */
export function emptyOpenAiCompatibleCredentials(): Record<
  ApiKeyBaseUrlProviderId,
  { apiKey: string; baseURL: string }
> {
  return emptyApiKeyBaseUrlCredentials()
}
