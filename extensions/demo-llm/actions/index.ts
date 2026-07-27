import type { ExtensionProviderAdapter, LlmProviderContribution } from '@teralexi/skill-sdk'

/**
 * Minimal adapter for registry wiring demos.
 * Production extensions should return a real AI SDK LanguageModel (e.g. via
 * `createOpenAICompatible` from a dependency they bundle).
 */
class DemoLlmAdapter implements ExtensionProviderAdapter {
  createModel(modelId: string, creds: unknown): unknown {
    return {
      providerId: 'demo-llm:local',
      modelId,
      creds,
      demo: true,
    }
  }
}

export const llmProviders: Record<string, LlmProviderContribution> = {
  local: {
    label: 'Demo LLM (stub)',
    adapter: new DemoLlmAdapter(),
    credentialFields: ['demoApiKey', 'demoBaseURL'],
  },
}
