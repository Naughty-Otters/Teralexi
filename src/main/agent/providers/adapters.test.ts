import { describe, expect, it, vi } from 'vitest'

const {
  createOllama,
  createOpenAI,
  createAnthropic,
  createGoogleGenerativeAI,
  createDeepSeek,
  createZhipu,
  createMoonshotAI,
  createAlibaba,
  createHuggingFace,
  createOpenAICompatible,
} = vi.hoisted(() => ({
  createOllama: vi.fn(() => vi.fn(() => ({ provider: 'ollama' }))),
  createOpenAI: vi.fn(() => vi.fn(() => ({ provider: 'openai' }))),
  createAnthropic: vi.fn(() => vi.fn(() => ({ provider: 'anthropic' }))),
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ provider: 'gemini' }))),
  createDeepSeek: vi.fn(() => vi.fn(() => ({ provider: 'deepseek' }))),
  createZhipu: vi.fn(() => vi.fn(() => ({ provider: 'zhipu' }))),
  createMoonshotAI: vi.fn(() => vi.fn(() => ({ provider: 'moonshot' }))),
  createAlibaba: vi.fn(() => vi.fn(() => ({ provider: 'qwen' }))),
  createHuggingFace: vi.fn(() => vi.fn(() => ({ provider: 'huggingface' }))),
  createOpenAICompatible: vi.fn(() => vi.fn(() => ({ provider: 'openai-compatible' }))),
}))

vi.mock('@teralexi-ai', () => ({
  createOllama,
  createOpenAI,
  createAnthropic,
  createGoogleGenerativeAI,
  createDeepSeek,
  createZhipu,
  createMoonshotAI,
  createAlibaba,
  createHuggingFace,
  createOpenAICompatible,
}))

import {
  AnthropicAdapter,
  DeepSeekAdapter,
  GeminiAdapter,
  HuggingFaceAdapter,
  LlamaCppAdapter,
  MoonshotAdapter,
  OllamaAdapter,
  OpenAIAdapter,
  OpenAiCompatibleProviderAdapter,
  QwenAdapter,
  ZhipuAdapter,
  PROVIDER_ADAPTERS,
} from './adapters'

describe('ProviderAdapter', () => {
  it('OllamaAdapter wires base URL', () => {
    const model = new OllamaAdapter().createModel('llama', {
      ollamaBaseURL: 'http://localhost:11434',
    } as never)
    expect(createOllama).toHaveBeenCalledWith({
      baseURL: 'http://localhost:11434/api',
    })
    expect(model).toEqual({ provider: 'ollama' })
  })

  it('LlamaCppAdapter uses openai-compatible client against llama-server base URL', () => {
    new LlamaCppAdapter().createModel('my-model', {
      llamacppBaseURL: 'http://127.0.0.1:8080/v1',
      llamacppApiKey: '',
    } as never)
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'llamacpp',
      apiKey: 'not-needed',
      baseURL: 'http://127.0.0.1:8080/v1',
    })
  })

  it('LlamaCppAdapter passes custom API key when set', () => {
    new LlamaCppAdapter().createModel('my-model', {
      llamacppBaseURL: 'http://127.0.0.1:8080/v1',
      llamacppApiKey: 'secret',
    } as never)
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'llamacpp',
      apiKey: 'secret',
      baseURL: 'http://127.0.0.1:8080/v1',
    })
  })

  it('OpenAIAdapter passes api key and base URL', () => {
    new OpenAIAdapter().createModel('gpt-4', {
      openaiApiKey: 'key',
      openaiBaseURL: 'https://api.example.com/v1',
    } as never)
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      baseURL: 'https://api.example.com/v1',
    })
  })

  it('AnthropicAdapter passes api key and base URL', () => {
    new AnthropicAdapter().createModel('claude', {
      anthropicApiKey: 'anth',
      anthropicBaseURL: 'https://api.anthropic.com/v1',
    } as never)
    expect(createAnthropic).toHaveBeenCalledWith({
      apiKey: 'anth',
      baseURL: 'https://api.anthropic.com/v1',
    })
  })

  it('GeminiAdapter passes api key and base URL', () => {
    new GeminiAdapter().createModel('gemini-pro', {
      geminiApiKey: 'gem',
      geminiBaseURL: 'https://generativelanguage.googleapis.com/v1beta',
    } as never)
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: 'gem',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    })
  })

  it('DeepSeekAdapter passes api key and base URL', () => {
    new DeepSeekAdapter().createModel('deepseek-v4-pro', {
      deepseekApiKey: 'ds-key',
      deepseekApiUrl: 'https://api.deepseek.com/v1',
    } as never)
    expect(createDeepSeek).toHaveBeenCalledWith({
      apiKey: 'ds-key',
      baseURL: 'https://api.deepseek.com/v1',
    })
  })

  it('ZhipuAdapter passes api key and base URL', () => {
    const model = new ZhipuAdapter().createModel('glm-4.6', {
      zhipuApiKey: 'zp-key',
      zhipuBaseURL: 'https://api.z.ai/api/paas/v4',
    } as never)
    expect(createZhipu).toHaveBeenCalledWith({
      apiKey: 'zp-key',
      baseURL: 'https://api.z.ai/api/paas/v4',
    })
    expect(model).toEqual({ provider: 'zhipu' })
  })

  it('MoonshotAdapter uses moonshotai provider', () => {
    new MoonshotAdapter().createModel('kimi-k2-turbo-preview', {
      openAiCompatible: {
        moonshot: {
          apiKey: 'moon-key',
          baseURL: 'https://api.moonshot.ai/v1',
        },
      },
    } as never)
    expect(createMoonshotAI).toHaveBeenCalledWith({
      apiKey: 'moon-key',
      baseURL: 'https://api.moonshot.ai/v1',
    })
  })

  it('QwenAdapter uses alibaba provider', () => {
    new QwenAdapter().createModel('qwen-plus', {
      openAiCompatible: {
        qwen: {
          apiKey: 'qwen-key',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        },
      },
    } as never)
    expect(createAlibaba).toHaveBeenCalledWith({
      apiKey: 'qwen-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    })
  })

  it('HuggingFaceAdapter uses huggingface provider', () => {
    new HuggingFaceAdapter().createModel('meta-llama/Llama-3.1-8B', {
      openAiCompatible: {
        huggingface: {
          apiKey: 'hf-key',
          baseURL: 'https://router.huggingface.co/v1',
        },
      },
    } as never)
    expect(createHuggingFace).toHaveBeenCalledWith({
      apiKey: 'hf-key',
      baseURL: 'https://router.huggingface.co/v1',
    })
  })

  it('OpenAiCompatibleProviderAdapter wires bytedance credentials', () => {
    new OpenAiCompatibleProviderAdapter('bytedance', 'bytedance').createModel('doubao', {
      openAiCompatible: {
        bytedance: {
          apiKey: 'ark-key',
          baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        },
      },
    } as never)
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'bytedance',
      apiKey: 'ark-key',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    })
  })
})

describe('PROVIDER_ADAPTERS', () => {
  it('exposes all provider types', () => {
    expect(Object.keys(PROVIDER_ADAPTERS).sort()).toEqual([
      'anthropic',
      'bytedance',
      'custom',
      'deepseek',
      'gemini',
      'huggingface',
      'llamacpp',
      'moonshot',
      'nvidia-nim',
      'ollama',
      'openai',
      'qwen',
      'zhipu',
    ])
  })
})
