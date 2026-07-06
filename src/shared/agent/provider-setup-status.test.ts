import { describe, expect, it } from 'vitest'
import {
  hasAnyLlmProviderConfigured,
  isLlmProviderConfigured,
  type LlmProviderCredentialsSnapshot,
} from './provider-setup-status'

function emptyCreds(
  overrides: Partial<LlmProviderCredentialsSnapshot> = {},
): LlmProviderCredentialsSnapshot {
  return {
    ollamaReachable: false,
    llamacppReachable: false,
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    zhipuApiKey: '',
    openAiCompatible: {
      moonshot: { apiKey: '' },
      qwen: { apiKey: '' },
      bytedance: { apiKey: '' },
      huggingface: { apiKey: '' },
      'nvidia-nim': { apiKey: '' },
      custom: { apiKey: '' },
    },
    ...overrides,
  }
}

describe('provider-setup-status', () => {
  it('detects configured cloud keys', () => {
    expect(
      isLlmProviderConfigured('openai', emptyCreds({ openaiApiKey: 'sk-test-key' })),
    ).toBe(true)
    expect(isLlmProviderConfigured('openai', emptyCreds())).toBe(false)
  })

  it('detects reachable local providers', () => {
    expect(isLlmProviderConfigured('ollama', emptyCreds({ ollamaReachable: true }))).toBe(
      true,
    )
  })

  it('hasAnyLlmProviderConfigured is false when nothing set', () => {
    expect(hasAnyLlmProviderConfigured(emptyCreds())).toBe(false)
  })

  it('hasAnyLlmProviderConfigured is true when any provider ready', () => {
    expect(
      hasAnyLlmProviderConfigured(emptyCreds({ deepseekApiKey: 'sk-abcdefgh' })),
    ).toBe(true)
  })
})
