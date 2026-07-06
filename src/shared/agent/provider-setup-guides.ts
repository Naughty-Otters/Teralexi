import type { ProviderType } from './llm-provider-registry'
import {
  API_KEY_BASE_URL_LLM_PROVIDERS,
  CLOUD_LLM_PROVIDER_IDS,
  LOCAL_LLM_PROVIDER_IDS,
  llmProviderCategory,
  type LlmProviderCategory,
  VENDOR_LLM_PROVIDER_IDS,
  WHOLESALE_LLM_PROVIDER_IDS,
} from './llm-provider-registry'

export type ProviderSetupCategory = LlmProviderCategory

export type ProviderSetupMeta = {
  id: ProviderType
  category: ProviderSetupCategory
  requiresApiKey: boolean
  /** Provider console where users create API keys */
  consoleUrl?: string
  docsUrl?: string
  installUrl?: string
  keyPlaceholder?: string
  defaultBaseUrl?: string
}

const CLOUD_DEFAULTS: Partial<
  Record<ProviderType, Pick<ProviderSetupMeta, 'consoleUrl' | 'docsUrl' | 'keyPlaceholder'>>
> = {
  openai: {
    consoleUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    keyPlaceholder: 'sk-…',
  },
  anthropic: {
    consoleUrl: 'https://platform.claude.com/settings/workspaces/default/keys',
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
    keyPlaceholder: 'sk-ant-…',
  },
  gemini: {
    consoleUrl: 'https://aistudio.google.com/app/api-keys',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    keyPlaceholder: 'AI…',
  },
  deepseek: {
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    keyPlaceholder: 'sk-…',
  },
  zhipu: {
    consoleUrl: 'https://z.ai/manage-apikey/apikey-list',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
    keyPlaceholder: '…',
  },
}

function metaForApiKeyBaseUrlProvider(id: ProviderType): ProviderSetupMeta | undefined {
  if (!(id in API_KEY_BASE_URL_LLM_PROVIDERS)) return undefined
  const m = API_KEY_BASE_URL_LLM_PROVIDERS[id as keyof typeof API_KEY_BASE_URL_LLM_PROVIDERS]
  const consoleUrls: Partial<Record<string, string>> = {
    moonshot: 'https://platform.moonshot.cn/console/api-keys',
    qwen: 'https://dashscope.console.aliyun.com/apiKey',
    bytedance: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    huggingface: 'https://huggingface.co/settings/tokens',
    'nvidia-nim': 'https://build.nvidia.com/settings/api-key',
    fireworks: 'https://app.fireworks.ai/settings/users/api-keys',
    openrouter: 'https://openrouter.ai/keys',
    togetherai: 'https://api.together.ai/settings/api-keys',
    groq: 'https://console.groq.com/keys',
    deepinfra: 'https://deepinfra.com/dash/api_keys',
    custom: 'https://models.dev',
  }
  const docsUrls: Partial<Record<string, string>> = {
    fireworks: 'https://docs.fireworks.ai/getting-started/quickstart',
    openrouter: 'https://openrouter.ai/docs/quickstart',
    togetherai: 'https://docs.together.ai/docs/quickstart',
    groq: 'https://console.groq.com/docs/quickstart',
    deepinfra: 'https://deepinfra.com/docs',
    custom: 'https://models.dev',
  }
  return {
    id,
    category: m.category,
    requiresApiKey: true,
    consoleUrl: consoleUrls[id],
    docsUrl: docsUrls[id],
    keyPlaceholder: 'API key…',
    defaultBaseUrl: m.defaultBaseUrl,
  }
}

export const PROVIDER_SETUP_META: Record<ProviderType, ProviderSetupMeta> = {
  ollama: {
    id: 'ollama',
    category: 'local',
    requiresApiKey: false,
    installUrl: 'https://ollama.com/download',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
  },
  llamacpp: {
    id: 'llamacpp',
    category: 'local',
    requiresApiKey: false,
    docsUrl: 'https://github.com/ggerganov/llama.cpp/blob/master/tools/server/README.md',
  },
  openai: {
    id: 'openai',
    category: 'vendor',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    ...CLOUD_DEFAULTS.openai,
  },
  anthropic: {
    id: 'anthropic',
    category: 'vendor',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    ...CLOUD_DEFAULTS.anthropic,
  },
  gemini: {
    id: 'gemini',
    category: 'vendor',
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    ...CLOUD_DEFAULTS.gemini,
  },
  deepseek: {
    id: 'deepseek',
    category: 'vendor',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    ...CLOUD_DEFAULTS.deepseek,
  },
  zhipu: {
    id: 'zhipu',
    category: 'vendor',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    ...CLOUD_DEFAULTS.zhipu,
  },
  moonshot: metaForApiKeyBaseUrlProvider('moonshot')!,
  qwen: metaForApiKeyBaseUrlProvider('qwen')!,
  bytedance: metaForApiKeyBaseUrlProvider('bytedance')!,
  huggingface: metaForApiKeyBaseUrlProvider('huggingface')!,
  'nvidia-nim': metaForApiKeyBaseUrlProvider('nvidia-nim')!,
  fireworks: metaForApiKeyBaseUrlProvider('fireworks')!,
  openrouter: metaForApiKeyBaseUrlProvider('openrouter')!,
  togetherai: metaForApiKeyBaseUrlProvider('togetherai')!,
  groq: metaForApiKeyBaseUrlProvider('groq')!,
  deepinfra: metaForApiKeyBaseUrlProvider('deepinfra')!,
  custom: metaForApiKeyBaseUrlProvider('custom')!,
}

export function providerSetupMeta(provider: ProviderType): ProviderSetupMeta {
  return PROVIDER_SETUP_META[provider]
}

export {
  CLOUD_LLM_PROVIDER_IDS,
  LOCAL_LLM_PROVIDER_IDS,
  VENDOR_LLM_PROVIDER_IDS,
  WHOLESALE_LLM_PROVIDER_IDS,
  llmProviderCategory,
}

export const VENDOR_LLM_PROVIDER_IDS_LIST = [...VENDOR_LLM_PROVIDER_IDS]
export const WHOLESALE_LLM_PROVIDER_IDS_LIST = [...WHOLESALE_LLM_PROVIDER_IDS]
