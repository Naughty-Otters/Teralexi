import type {
  LlmProviderCredentialsSnapshot,
} from '@shared/agent/provider-setup-status'
import {
  isOpenAiCompatibleProvider,
  OPENAI_COMPATIBLE_LLM_PROVIDERS,
  OPENAI_COMPATIBLE_PROVIDER_IDS,
  type OpenAiCompatibleProviderId,
} from '@shared/agent/llm-provider-registry'
import { normalizeLlamaCppBaseURL } from '@shared/agent/llamacpp-url'
import { markOnboardingCompleteInRouteCache } from '@renderer/lib/onboarding-route-state'
import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  XAI_MODELS,
  ZHIPU_MODELS,
  SYSTEM_PROP_KEYS,
  PROVIDER_SETUP_DISMISSED_KEY,
  ONBOARDING_COMPLETED_KEY,
  normalizeBaseURL,
  setSystemConfigValue,
} from './config'
import type { AgentStoreContext } from './agent-store-context'
import type { ProviderConnectionTestResult } from './initial-state'
import type { ProviderType } from './types'

export type AgentMutationCallbacks = {
  updateAgentProvider: (agentId: string, provider: ProviderType) => void
  updateAgentModel: (agentId: string, model: string) => void
}

export function createLlmProviderActions(
  ctx: AgentStoreContext,
  mutations: AgentMutationCallbacks,
) {
  const {
    log,
    connectionStatus,
    llamacppBaseURL,
    llamacppApiKey,
    llamacppConnectionStatus,
    ollamaBaseURL,
    anthropicApiKey,
    anthropicBaseURL,
    openaiApiKey,
    openaiBaseURL,
    geminiApiKey,
    geminiBaseURL,
    deepseekApiKey,
    deepseekApiUrl,
    xaiApiKey,
    xaiBaseURL,
    zhipuApiKey,
    zhipuBaseURL,
    openAiCompatibleApiKeys,
    openAiCompatibleBaseUrls,
    availableModelsByProvider,
    providerSetupDismissed,
    onboardingCompleted,
    agents,
  } = ctx
  const { updateAgentProvider, updateAgentModel } = mutations

  async function checkConnection() {
    await fetchModelsForProvider('ollama')
  }

  async function checkLlamaCppConnection() {
    try {
      const headers: Record<string, string> = {}
      if (llamacppApiKey.value) {
        headers.Authorization = `Bearer ${llamacppApiKey.value}`
      }
      const res = await fetch(`${llamacppBaseURL.value}/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      llamacppConnectionStatus.value = res.ok ? 'connected' : 'error'
    } catch {
      llamacppConnectionStatus.value = 'error'
    }
  }

  function buildLlmCredentialsSnapshot(): LlmProviderCredentialsSnapshot {
    const compatible = {} as LlmProviderCredentialsSnapshot['openAiCompatible']
    for (const id of OPENAI_COMPATIBLE_PROVIDER_IDS) {
      compatible[id] = { apiKey: openAiCompatibleApiKeys.value[id] ?? '' }
    }
    return {
      ollamaReachable: connectionStatus.value === 'connected',
      llamacppReachable: llamacppConnectionStatus.value === 'connected',
      openaiApiKey: openaiApiKey.value,
      anthropicApiKey: anthropicApiKey.value,
      geminiApiKey: geminiApiKey.value,
      deepseekApiKey: deepseekApiKey.value,
      xaiApiKey: xaiApiKey.value,
      zhipuApiKey: zhipuApiKey.value,
      openAiCompatible: compatible,
    }
  }

  async function dismissProviderSetupWizard(): Promise<void> {
    providerSetupDismissed.value = true
    await setSystemConfigValue(PROVIDER_SETUP_DISMISSED_KEY, 'true')
  }

  async function completeOnboarding(): Promise<void> {
    onboardingCompleted.value = true
    providerSetupDismissed.value = true
    await setSystemConfigValue(ONBOARDING_COMPLETED_KEY, 'true')
    await setSystemConfigValue(PROVIDER_SETUP_DISMISSED_KEY, 'true')
    markOnboardingCompleteInRouteCache()
  }

  function applyLlmDefaultsToAllAgents(
    provider: ProviderType,
    model: string,
  ): void {
    const normalizedModel = model.trim()
    if (!normalizedModel) return
    for (const agent of agents.value) {
      updateAgentProvider(agent.id, provider)
      updateAgentModel(agent.id, normalizedModel)
    }
  }

  async function testProviderConnection(
    provider: ProviderType,
  ): Promise<ProviderConnectionTestResult> {
    try {
      if (provider === 'ollama') {
        await checkConnection()
        if (connectionStatus.value !== 'connected') {
          return { ok: false, error: 'Cannot reach Ollama server' }
        }
        const modelCount = availableModelsByProvider.value.ollama?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'llamacpp') {
        await checkLlamaCppConnection()
        if (llamacppConnectionStatus.value !== 'connected') {
          return { ok: false, error: 'Cannot reach llama.cpp server' }
        }
        await fetchModelsForProvider('llamacpp')
        const modelCount = availableModelsByProvider.value.llamacpp?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'openai') {
        const key = openaiApiKey.value.trim()
        if (!key) return { ok: false, error: 'API key is required' }
        const res = await fetch(`${openaiBaseURL.value}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          return { ok: false, error: `OpenAI API returned ${res.status}` }
        }
        await fetchModelsForProvider('openai')
        const modelCount = availableModelsByProvider.value.openai?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'gemini') {
        const key = geminiApiKey.value.trim()
        if (!key) return { ok: false, error: 'API key is required' }
        const res = await fetch(
          `${geminiBaseURL.value}/models?key=${encodeURIComponent(key)}`,
          { signal: AbortSignal.timeout(8000) },
        )
        if (!res.ok) {
          return { ok: false, error: `Gemini API returned ${res.status}` }
        }
        await fetchModelsForProvider('gemini')
        const modelCount = availableModelsByProvider.value.gemini?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'anthropic') {
        const key = anthropicApiKey.value.trim()
        if (key.length < 8) return { ok: false, error: 'API key is required' }
        updateAnthropicApiKey(key)
        await fetchModelsForProvider('anthropic')
        const modelCount = availableModelsByProvider.value.anthropic?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'deepseek') {
        const key = deepseekApiKey.value.trim()
        if (key.length < 8) return { ok: false, error: 'API key is required' }
        const res = await fetch(`${deepseekApiUrl.value}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          updateDeepSeekApiKey(key)
          await fetchModelsForProvider('deepseek')
          const modelCount = availableModelsByProvider.value.deepseek?.length ?? 0
          return modelCount > 0
            ? { ok: true, modelCount }
            : { ok: false, error: `DeepSeek API returned ${res.status}` }
        }
        await fetchModelsForProvider('deepseek')
        const modelCount = availableModelsByProvider.value.deepseek?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'xai') {
        const key = xaiApiKey.value.trim()
        if (key.length < 8) return { ok: false, error: 'API key is required' }
        const res = await fetch(`${xaiBaseURL.value}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          updateXaiApiKey(key)
          await fetchModelsForProvider('xai')
          const modelCount = availableModelsByProvider.value.xai?.length ?? 0
          return modelCount > 0
            ? { ok: true, modelCount }
            : { ok: false, error: `xAI API returned ${res.status}` }
        }
        await fetchModelsForProvider('xai')
        const modelCount = availableModelsByProvider.value.xai?.length ?? 0
        return { ok: true, modelCount }
      }

      if (provider === 'zhipu') {
        const key = zhipuApiKey.value.trim()
        if (key.length < 8) return { ok: false, error: 'API key is required' }
        updateZhipuApiKey(key)
        await fetchModelsForProvider('zhipu')
        const modelCount = availableModelsByProvider.value.zhipu?.length ?? 0
        return { ok: true, modelCount }
      }

      if (isOpenAiCompatibleProvider(provider)) {
        const key = openAiCompatibleApiKeys.value[provider]?.trim() ?? ''
        if (!key) return { ok: false, error: 'API key is required' }
        const baseUrl = openAiCompatibleBaseUrls.value[provider]
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          return { ok: false, error: `${provider} API returned ${res.status}` }
        }
        await fetchModelsForProvider(provider)
        const modelCount =
          availableModelsByProvider.value[provider]?.length ?? 0
        return { ok: true, modelCount }
      }

      return { ok: false, error: 'Unknown provider' }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }
    }
  }

  async function fetchModelsForProvider(provider: ProviderType) {
    try {
      if (provider === 'ollama') {
        const res = await fetch(`${ollamaBaseURL.value}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          connectionStatus.value = 'error'
          return
        }
        const data = await res.json()
        connectionStatus.value = 'connected'
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          ollama: (data.models ?? []).map((m: { name: string }) => m.name),
        }
      } else if (provider === 'llamacpp') {
        const headers: Record<string, string> = {}
        if (llamacppApiKey.value) {
          headers.Authorization = `Bearer ${llamacppApiKey.value}`
        }
        const res = await fetch(`${llamacppBaseURL.value}/models`, {
          headers,
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return
        const data = await res.json()
        const ids: string[] = (data.data ?? [])
          .map((m: { id: string }) => m.id)
          .filter(Boolean)
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          llamacpp: ids,
        }
      } else if (provider === 'openai' && openaiApiKey.value) {
        const res = await fetch(`${openaiBaseURL.value}/models`, {
          headers: { Authorization: `Bearer ${openaiApiKey.value}` },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return
        const data = await res.json()
        const ids: string[] = (data.data ?? [])
          .map((m: { id: string }) => m.id)
          .filter((id: string) => /^(gpt-|o1|o3)/.test(id))
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          openai: ids,
        }
      } else if (provider === 'anthropic') {
        // Hardcoded — no public list API
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          anthropic: [...ANTHROPIC_MODELS],
        }
      } else if (provider === 'deepseek') {
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          deepseek: [...DEEPSEEK_MODELS],
        }
      } else if (provider === 'xai') {
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          xai: [...XAI_MODELS],
        }
      } else if (provider === 'zhipu') {
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          zhipu: [...ZHIPU_MODELS],
        }
      } else if (provider === 'gemini' && geminiApiKey.value) {
        const res = await fetch(
          `${geminiBaseURL.value}/models?key=${geminiApiKey.value}`,
          { signal: AbortSignal.timeout(5000) },
        )
        if (!res.ok) return
        const data = await res.json()
        const names: string[] = (data.models ?? [])
          .filter((m: { supportedGenerationMethods?: string[] }) =>
            m.supportedGenerationMethods?.includes('generateContent'),
          )
          .map((m: { name: string }) => m.name.replace(/^models\//, ''))
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          gemini: names,
        }
      } else if (isOpenAiCompatibleProvider(provider)) {
        const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
        const apiKey = openAiCompatibleApiKeys.value[provider]
        const baseUrl = openAiCompatibleBaseUrls.value[provider]
        const fallback = [...meta.defaultModels]
        if (!apiKey) {
          availableModelsByProvider.value = {
            ...availableModelsByProvider.value,
            [provider]: fallback,
          }
          return
        }
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          availableModelsByProvider.value = {
            ...availableModelsByProvider.value,
            [provider]: fallback,
          }
          return
        }
        const data = await res.json()
        const ids: string[] = (data.data ?? [])
          .map((m: { id: string }) => m.id)
          .filter(Boolean)
          .sort()
        availableModelsByProvider.value = {
          ...availableModelsByProvider.value,
          [provider]: ids.length > 0 ? ids : fallback,
        }
      }
    } catch (error) {
      if (provider === 'ollama') {
        connectionStatus.value = 'error'
      }
      // silently fail
      log.warn('Failed to fetch models for provider', { provider, err: error })
    }
  }

  // Keep the old fetchModels for backward compat (fetches Ollama)
  async function fetchModels() {
    await fetchModelsForProvider('ollama')
  }

  function updateOllamaURL(url: string) {
    ollamaBaseURL.value = normalizeBaseURL(url, 'http://localhost:11434')
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.ollamaBaseURL,
      ollamaBaseURL.value,
    )
    connectionStatus.value = 'unknown'
  }

  function updateLlamaCppURL(url: string) {
    llamacppBaseURL.value = normalizeLlamaCppBaseURL(url)
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.llamacppBaseURL,
      llamacppBaseURL.value,
    )
    llamacppConnectionStatus.value = 'unknown'
  }

  function updateLlamaCppApiKey(key: string) {
    llamacppApiKey.value = key.trim()
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.llamacppApiKey,
      llamacppApiKey.value,
    )
    llamacppConnectionStatus.value = 'unknown'
  }

  function updateAnthropicApiKey(key: string) {
    anthropicApiKey.value = key.trim()
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.anthropicApiKey,
      anthropicApiKey.value,
    )
  }

  function updateAnthropicBaseURL(url: string) {
    anthropicBaseURL.value = normalizeBaseURL(
      url,
      'https://api.anthropic.com/v1',
    )
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.anthropicBaseURL,
      anthropicBaseURL.value,
    )
  }

  function updateOpenAIApiKey(key: string) {
    openaiApiKey.value = key.trim()
    void setSystemConfigValue(SYSTEM_PROP_KEYS.openaiApiKey, openaiApiKey.value)
  }

  function updateOpenAIBaseURL(url: string) {
    openaiBaseURL.value = normalizeBaseURL(url, 'https://api.openai.com/v1')
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.openaiBaseURL,
      openaiBaseURL.value,
    )
  }

  function updateGeminiApiKey(key: string) {
    geminiApiKey.value = key.trim()
    void setSystemConfigValue(SYSTEM_PROP_KEYS.geminiApiKey, geminiApiKey.value)
  }

  function updateGeminiBaseURL(url: string) {
    geminiBaseURL.value = normalizeBaseURL(
      url,
      'https://generativelanguage.googleapis.com/v1beta',
    )
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.geminiBaseURL,
      geminiBaseURL.value,
    )
  }

  function updateDeepSeekApiKey(key: string) {
    deepseekApiKey.value = key.trim()
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.deepseekApiKey,
      deepseekApiKey.value,
    )
  }

  function updateDeepSeekApiUrl(url: string) {
    deepseekApiUrl.value = normalizeBaseURL(url, 'https://api.deepseek.com/v1')
    void setSystemConfigValue(
      SYSTEM_PROP_KEYS.deepseekApiUrl,
      deepseekApiUrl.value,
    )
  }

  function updateXaiApiKey(key: string) {
    xaiApiKey.value = key.trim()
    void setSystemConfigValue(SYSTEM_PROP_KEYS.xaiApiKey, xaiApiKey.value)
  }

  function updateXaiBaseURL(url: string) {
    xaiBaseURL.value = normalizeBaseURL(url, 'https://api.x.ai/v1')
    void setSystemConfigValue(SYSTEM_PROP_KEYS.xaiBaseURL, xaiBaseURL.value)
  }

  function updateZhipuApiKey(key: string) {
    zhipuApiKey.value = key.trim()
    void setSystemConfigValue(SYSTEM_PROP_KEYS.zhipuApiKey, zhipuApiKey.value)
  }

  function updateZhipuBaseURL(url: string) {
    zhipuBaseURL.value = normalizeBaseURL(
      url,
      'https://api.z.ai/api/paas/v4',
    )
    void setSystemConfigValue(SYSTEM_PROP_KEYS.zhipuBaseURL, zhipuBaseURL.value)
  }

  function getOpenAiCompatibleApiKey(
    provider: OpenAiCompatibleProviderId,
  ): string {
    return openAiCompatibleApiKeys.value[provider]
  }

  function getOpenAiCompatibleBaseUrl(
    provider: OpenAiCompatibleProviderId,
  ): string {
    return openAiCompatibleBaseUrls.value[provider]
  }

  function updateOpenAiCompatibleApiKey(
    provider: OpenAiCompatibleProviderId,
    key: string,
  ) {
    const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
    openAiCompatibleApiKeys.value = {
      ...openAiCompatibleApiKeys.value,
      [provider]: key.trim(),
    }
    void setSystemConfigValue(
      meta.apiKeyConfigKey,
      openAiCompatibleApiKeys.value[provider],
    )
  }

  function updateOpenAiCompatibleBaseUrl(
    provider: OpenAiCompatibleProviderId,
    url: string,
  ) {
    const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider]
    const normalized = normalizeBaseURL(url, meta.defaultBaseUrl)
    openAiCompatibleBaseUrls.value = {
      ...openAiCompatibleBaseUrls.value,
      [provider]: normalized,
    }
    void setSystemConfigValue(meta.baseUrlConfigKey, normalized)
  }
  return {
    checkConnection,
    checkLlamaCppConnection,
    buildLlmCredentialsSnapshot,
    dismissProviderSetupWizard,
    completeOnboarding,
    applyLlmDefaultsToAllAgents,
    testProviderConnection,
    fetchModelsForProvider,
    fetchModels,
    updateOllamaURL,
    updateLlamaCppURL,
    updateLlamaCppApiKey,
    updateAnthropicApiKey,
    updateAnthropicBaseURL,
    updateOpenAIApiKey,
    updateOpenAIBaseURL,
    updateGeminiApiKey,
    updateGeminiBaseURL,
    updateDeepSeekApiKey,
    updateDeepSeekApiUrl,
    updateXaiApiKey,
    updateXaiBaseURL,
    updateZhipuApiKey,
    updateZhipuBaseURL,
    getOpenAiCompatibleApiKey,
    getOpenAiCompatibleBaseUrl,
    updateOpenAiCompatibleApiKey,
    updateOpenAiCompatibleBaseUrl,
  }
}
