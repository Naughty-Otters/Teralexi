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
] as const

export type ProviderType = (typeof LLM_PROVIDER_IDS)[number]

/** Skill properties.md provider field — same set as agent providers. */
export type SkillProvider = ProviderType

export type OpenAiCompatibleProviderId =
  | 'moonshot'
  | 'qwen'
  | 'bytedance'
  | 'huggingface'
  | 'nvidia-nim'

export type OpenAiCompatibleProviderMeta = {
  id: OpenAiCompatibleProviderId
  label: string
  apiKeyConfigKey: string
  baseUrlConfigKey: string
  defaultBaseUrl: string
  defaultModels: readonly string[]
  hint: string
}

export const OPENAI_COMPATIBLE_LLM_PROVIDERS: Record<
  OpenAiCompatibleProviderId,
  OpenAiCompatibleProviderMeta
> = {
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot',
    apiKeyConfigKey: 'settings.moonshot.apiKey',
    baseUrlConfigKey: 'settings.moonshot.baseUrl',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
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
    apiKeyConfigKey: 'settings.qwen.apiKey',
    baseUrlConfigKey: 'settings.qwen.baseUrl',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen3-max'],
    hint: 'Alibaba Qwen via DashScope compatible-mode. Use your DashScope API key.',
  },
  bytedance: {
    id: 'bytedance',
    label: 'ByteDance',
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
    apiKeyConfigKey: 'settings.nvidiaNim.apiKey',
    baseUrlConfigKey: 'settings.nvidiaNim.baseUrl',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModels: [],
    hint: 'NVIDIA NIM OpenAI-compatible API. Model list loads from /models when configured.',
  },
}

export const OPENAI_COMPATIBLE_PROVIDER_IDS = Object.keys(
  OPENAI_COMPATIBLE_LLM_PROVIDERS,
) as OpenAiCompatibleProviderId[]

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
}

/** Canonical provider label for settings tabs and dropdowns. */
export function llmProviderSettingsLabel(id: ProviderType): string {
  if (id === 'ollama') return 'Ollama (local)'
  if (id === 'llamacpp') return 'llama.cpp (local)'
  return LLM_PROVIDER_LABELS[id]
}

export const LLM_PROVIDER_SETTINGS_OPTIONS = LLM_PROVIDER_IDS.map((id) => ({
  id,
  label: llmProviderSettingsLabel(id),
}))

export function isOpenAiCompatibleProvider(
  provider: ProviderType,
): provider is OpenAiCompatibleProviderId {
  return provider in OPENAI_COMPATIBLE_LLM_PROVIDERS
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

export function openAiCompatibleProviderMeta(
  provider: OpenAiCompatibleProviderId,
): OpenAiCompatibleProviderMeta {
  return OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
}

export function resolveOpenAiCompatibleCredentials(
  provider: OpenAiCompatibleProviderId,
  values: Record<string, string | undefined>,
): { apiKey: string; baseURL: string } {
  const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
  return {
    apiKey: (values[meta.apiKeyConfigKey] ?? '').trim(),
    baseURL: normalizeProviderBaseUrl(
      values[meta.baseUrlConfigKey] ?? '',
      meta.defaultBaseUrl,
    ),
  }
}

export function openAiCompatibleProviderConfigKeys(): string[] {
  return OPENAI_COMPATIBLE_PROVIDER_IDS.flatMap((id) => {
    const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[id]
    return [meta.apiKeyConfigKey, meta.baseUrlConfigKey]
  })
}

/** SQL CHECK list for agent_configurations.provider */
export const AGENT_PROVIDER_SQL_CHECK = `(${LLM_PROVIDER_IDS.map((id) => `'${id}'`).join(', ')})`

export function emptyOpenAiCompatibleCredentials(): Record<
  OpenAiCompatibleProviderId,
  { apiKey: string; baseURL: string }
> {
  const out = {} as Record<
    OpenAiCompatibleProviderId,
    { apiKey: string; baseURL: string }
  >
  for (const id of OPENAI_COMPATIBLE_PROVIDER_IDS) {
    const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[id]
    out[id] = { apiKey: '', baseURL: meta.defaultBaseUrl }
  }
  return out
}
