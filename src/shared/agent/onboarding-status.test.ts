import { describe, expect, it } from 'vitest'
import {
  areAllAgentsReadyForOnboarding,
  isAgentReadyForOnboarding,
} from './onboarding-status'
import type { LlmProviderCredentialsSnapshot } from './provider-setup-status'

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
      fireworks: { apiKey: '' },
      openrouter: { apiKey: '' },
      togetherai: { apiKey: '' },
      groq: { apiKey: '' },
      deepinfra: { apiKey: '' },
      custom: { apiKey: '' },
    },
    ...overrides,
  }
}

describe('onboarding-status', () => {
  it('requires provider configured and non-empty model', () => {
    const creds = emptyCreds({ openaiApiKey: 'sk-test-key-1' })
    expect(
      isAgentReadyForOnboarding(
        { provider: 'openai', model: 'gpt-4o' },
        creds,
      ),
    ).toBe(true)
    expect(
      isAgentReadyForOnboarding({ provider: 'openai', model: '' }, creds),
    ).toBe(false)
    expect(
      isAgentReadyForOnboarding(
        { provider: 'anthropic', model: 'claude-sonnet' },
        creds,
      ),
    ).toBe(false)
  })

  it('areAllAgentsReadyForOnboarding checks every agent', () => {
    const creds = emptyCreds({ openaiApiKey: 'sk-test-key-1' })
    expect(
      areAllAgentsReadyForOnboarding(
        [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'openai', model: 'gpt-4o-mini' },
        ],
        creds,
      ),
    ).toBe(true)
    expect(
      areAllAgentsReadyForOnboarding(
        [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'ollama', model: 'llama3.2' },
        ],
        creds,
      ),
    ).toBe(false)
  })
})
