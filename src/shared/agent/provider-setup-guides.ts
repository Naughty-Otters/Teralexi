import type { ProviderType } from './llm-provider-registry'
import { OPENAI_COMPATIBLE_LLM_PROVIDERS } from './llm-provider-registry'

export type ProviderSetupCategory = 'local' | 'cloud'

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

function metaForOpenAiCompatible(id: ProviderType): ProviderSetupMeta | undefined {
  if (!(id in OPENAI_COMPATIBLE_LLM_PROVIDERS)) return undefined
  const m = OPENAI_COMPATIBLE_LLM_PROVIDERS[id as keyof typeof OPENAI_COMPATIBLE_LLM_PROVIDERS]
  const consoleUrls: Partial<Record<string, string>> = {
    moonshot: 'https://platform.moonshot.cn/console/api-keys',
    qwen: 'https://dashscope.console.aliyun.com/apiKey',
    bytedance: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    huggingface: 'https://huggingface.co/settings/tokens',
    'nvidia-nim': 'https://build.nvidia.com/settings/api-key',
  }
  return {
    id,
    category: 'cloud',
    requiresApiKey: true,
    consoleUrl: consoleUrls[id],
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
    category: 'cloud',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    ...CLOUD_DEFAULTS.openai,
  },
  anthropic: {
    id: 'anthropic',
    category: 'cloud',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    ...CLOUD_DEFAULTS.anthropic,
  },
  gemini: {
    id: 'gemini',
    category: 'cloud',
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    ...CLOUD_DEFAULTS.gemini,
  },
  deepseek: {
    id: 'deepseek',
    category: 'cloud',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    ...CLOUD_DEFAULTS.deepseek,
  },
  zhipu: {
    id: 'zhipu',
    category: 'cloud',
    requiresApiKey: true,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    ...CLOUD_DEFAULTS.zhipu,
  },
  moonshot: metaForOpenAiCompatible('moonshot')!,
  qwen: metaForOpenAiCompatible('qwen')!,
  bytedance: metaForOpenAiCompatible('bytedance')!,
  huggingface: metaForOpenAiCompatible('huggingface')!,
  'nvidia-nim': metaForOpenAiCompatible('nvidia-nim')!,
}

export function providerSetupMeta(provider: ProviderType): ProviderSetupMeta {
  return PROVIDER_SETUP_META[provider]
}

export const CLOUD_LLM_PROVIDER_IDS = (
  Object.keys(PROVIDER_SETUP_META) as ProviderType[]
).filter((id) => PROVIDER_SETUP_META[id].category === 'cloud')

export const LOCAL_LLM_PROVIDER_IDS = (
  Object.keys(PROVIDER_SETUP_META) as ProviderType[]
).filter((id) => PROVIDER_SETUP_META[id].category === 'local')
