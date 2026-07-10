import type { OpenAiCompatibleProviderId } from './llm-provider-registry'
import { OPENAI_COMPATIBLE_PROVIDER_IDS } from './llm-provider-registry'
import type { ProviderType } from './llm-provider-registry'

/** Snapshot of LLM credentials for onboarding / readiness checks. */
export type LlmProviderCredentialsSnapshot = {
  ollamaReachable: boolean
  llamacppReachable: boolean
  openaiApiKey: string
  anthropicApiKey: string
  geminiApiKey: string
  deepseekApiKey: string
  xaiApiKey: string
  zhipuApiKey: string
  openAiCompatible: Record<OpenAiCompatibleProviderId, { apiKey: string }>
}

function cloudKeyConfigured(key: string): boolean {
  return key.trim().length >= 8
}

export function isLlmProviderConfigured(
  provider: ProviderType,
  creds: LlmProviderCredentialsSnapshot,
): boolean {
  switch (provider) {
    case 'ollama':
      return creds.ollamaReachable
    case 'llamacpp':
      return creds.llamacppReachable
    case 'openai':
      return cloudKeyConfigured(creds.openaiApiKey)
    case 'anthropic':
      return cloudKeyConfigured(creds.anthropicApiKey)
    case 'gemini':
      return cloudKeyConfigured(creds.geminiApiKey)
    case 'deepseek':
      return cloudKeyConfigured(creds.deepseekApiKey)
    case 'xai':
      return cloudKeyConfigured(creds.xaiApiKey)
    case 'zhipu':
      return cloudKeyConfigured(creds.zhipuApiKey)
    default:
      if (OPENAI_COMPATIBLE_PROVIDER_IDS.includes(provider as OpenAiCompatibleProviderId)) {
        const key = creds.openAiCompatible[provider as OpenAiCompatibleProviderId]?.apiKey ?? ''
        return cloudKeyConfigured(key)
      }
      return false
  }
}

export function hasAnyLlmProviderConfigured(
  creds: LlmProviderCredentialsSnapshot,
  providers?: readonly ProviderType[],
): boolean {
  const list = providers ?? [
    'ollama',
    'llamacpp',
    'openai',
    'anthropic',
    'gemini',
    'deepseek',
    'xai',
    'zhipu',
    ...OPENAI_COMPATIBLE_PROVIDER_IDS,
  ]
  return list.some((id) => isLlmProviderConfigured(id, creds))
}
