import {
  createAlibaba,
  createAnthropic,
  createDeepSeek,
  createFireworks,
  createGoogle,
  createHuggingFace,
  createMoonshotAI,
  createOllama,
  createOpenAI,
  createOpenAICompatible,
  createOpenRouter,
  createTogetherAI,
  createGroq,
  createDeepInfra,
  createXai,
  createZhipu,
} from '@teralexi-ai'
import type { ProviderCredentials, ProviderType } from '../types'
import type { ApiKeyBaseUrlProviderId } from '@shared/agent/llm-provider-registry'
import { createLogger, instrumentInstanceMethods } from '@main/logger'

const log = createLogger('agent.providers.adapters')

export abstract class ProviderAdapter {
  abstract createModel(modelId: string, creds: ProviderCredentials): unknown
}

export class OllamaAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createOllama({ baseURL: `${creds.ollamaBaseURL}/api` })(modelId)
  }
}

/** llama.cpp `llama-server` OpenAI-compatible HTTP API. */
export class LlamaCppAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const apiKey = creds.llamacppApiKey?.trim() || 'not-needed'
    return createOpenAICompatible({
      name: 'llamacpp',
      apiKey,
      baseURL: creds.llamacppBaseURL,
    })(modelId)
  }
}

export class OpenAIAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createOpenAI({
      apiKey: creds.openaiApiKey,
      baseURL: creds.openaiBaseURL,
    })(modelId)
  }
}

export class AnthropicAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createAnthropic({
      apiKey: creds.anthropicApiKey,
      baseURL: creds.anthropicBaseURL,
    })(modelId)
  }
}

export class GeminiAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createGoogle({
      apiKey: creds.geminiApiKey,
      baseURL: creds.geminiBaseURL,
    })(modelId)
  }
}

export class DeepSeekAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createDeepSeek({ apiKey: creds.deepseekApiKey, baseURL: creds.deepseekApiUrl })(modelId)
  }
}

export class XaiAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createXai({
      apiKey: creds.xaiApiKey,
      baseURL: creds.xaiBaseURL,
    })(modelId)
  }
}

export class ZhipuAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    return createZhipu({
      apiKey: creds.zhipuApiKey,
      baseURL: creds.zhipuBaseURL,
    })(modelId)
  }
}

export class MoonshotAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.moonshot
    return createMoonshotAI({ apiKey, baseURL })(modelId)
  }
}

export class QwenAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.qwen
    return createAlibaba({ apiKey, baseURL })(modelId)
  }
}

export class HuggingFaceAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.huggingface
    return createHuggingFace({ apiKey, baseURL })(modelId)
  }
}

/** Ark, NVIDIA NIM, and other vendors without a dedicated chat SDK in @ai-sdk. */
export class OpenAiCompatibleProviderAdapter extends ProviderAdapter {
  constructor(
    private readonly provider: ApiKeyBaseUrlProviderId,
    private readonly providerName: string,
  ) {
    super()
  }

  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible[this.provider]
    return createOpenAICompatible({
      name: this.providerName,
      apiKey: apiKey || 'not-needed',
      baseURL,
    })(modelId)
  }
}

export class FireworksAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.fireworks
    return createFireworks({
      apiKey,
      baseURL: baseURL || undefined,
    })(modelId)
  }
}

export class OpenRouterAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.openrouter
    return createOpenRouter({
      apiKey,
      baseURL: baseURL || undefined,
    })(modelId)
  }
}

export class TogetherAiAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.togetherai
    return createTogetherAI({
      apiKey,
      baseURL: baseURL || undefined,
    })(modelId)
  }
}

export class GroqAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.groq
    return createGroq({
      apiKey,
      baseURL: baseURL || undefined,
    })(modelId)
  }
}

export class DeepInfraAdapter extends ProviderAdapter {
  createModel(modelId: string, creds: ProviderCredentials) {
    const { apiKey, baseURL } = creds.openAiCompatible.deepinfra
    return createDeepInfra({
      apiKey,
      baseURL: baseURL || undefined,
    })(modelId)
  }
}

function openAiCompatibleAdapter(
  provider: ApiKeyBaseUrlProviderId,
  providerName: string,
): ProviderAdapter {
  return instrumentInstanceMethods(
    new OpenAiCompatibleProviderAdapter(provider, providerName),
    log.child({ provider }),
  )
}

export const PROVIDER_ADAPTERS: Record<ProviderType, ProviderAdapter> = {
  ollama: instrumentInstanceMethods(new OllamaAdapter(), log.child({ provider: 'ollama' })),
  llamacpp: instrumentInstanceMethods(
    new LlamaCppAdapter(),
    log.child({ provider: 'llamacpp' }),
  ),
  openai: instrumentInstanceMethods(new OpenAIAdapter(), log.child({ provider: 'openai' })),
  anthropic: instrumentInstanceMethods(
    new AnthropicAdapter(),
    log.child({ provider: 'anthropic' }),
  ),
  gemini: instrumentInstanceMethods(new GeminiAdapter(), log.child({ provider: 'gemini' })),
  deepseek: instrumentInstanceMethods(
    new DeepSeekAdapter(),
    log.child({ provider: 'deepseek' }),
  ),
  xai: instrumentInstanceMethods(new XaiAdapter(), log.child({ provider: 'xai' })),
  zhipu: instrumentInstanceMethods(new ZhipuAdapter(), log.child({ provider: 'zhipu' })),
  moonshot: instrumentInstanceMethods(new MoonshotAdapter(), log.child({ provider: 'moonshot' })),
  qwen: instrumentInstanceMethods(new QwenAdapter(), log.child({ provider: 'qwen' })),
  bytedance: openAiCompatibleAdapter('bytedance', 'bytedance'),
  huggingface: instrumentInstanceMethods(
    new HuggingFaceAdapter(),
    log.child({ provider: 'huggingface' }),
  ),
  'nvidia-nim': openAiCompatibleAdapter('nvidia-nim', 'nvidia-nim'),
  fireworks: instrumentInstanceMethods(
    new FireworksAdapter(),
    log.child({ provider: 'fireworks' }),
  ),
  openrouter: instrumentInstanceMethods(
    new OpenRouterAdapter(),
    log.child({ provider: 'openrouter' }),
  ),
  togetherai: instrumentInstanceMethods(
    new TogetherAiAdapter(),
    log.child({ provider: 'togetherai' }),
  ),
  groq: instrumentInstanceMethods(new GroqAdapter(), log.child({ provider: 'groq' })),
  deepinfra: instrumentInstanceMethods(
    new DeepInfraAdapter(),
    log.child({ provider: 'deepinfra' }),
  ),
  custom: openAiCompatibleAdapter('custom', 'custom'),
}

export function createModelForProvider(
  provider: ProviderType,
  modelId: string,
  creds: ProviderCredentials,
): unknown {
  const adapter = PROVIDER_ADAPTERS[provider]
  if (!adapter) {
    throw new Error(`Unknown provider: ${provider}`)
  }
  return adapter.createModel(modelId, creds)
}
