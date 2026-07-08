import { describe, expect, it } from 'vitest'
import {
  CLOUD_LLM_PROVIDER_IDS,
  LOCAL_LLM_PROVIDER_IDS,
  PROVIDER_SETUP_META,
  VENDOR_LLM_PROVIDER_IDS_LIST,
  WHOLESALE_LLM_PROVIDER_IDS_LIST,
  llmProviderCategory,
  providerSetupMeta,
} from './provider-setup-guides'

describe('provider-setup-guides', () => {
  it('defines setup metadata for every provider id', () => {
    const allIds = [
      ...LOCAL_LLM_PROVIDER_IDS,
      ...CLOUD_LLM_PROVIDER_IDS,
    ] as const

    for (const id of allIds) {
      const meta = PROVIDER_SETUP_META[id]
      expect(meta.id).toBe(id)
      expect(meta.category).toBe(llmProviderCategory(id))
      expect(providerSetupMeta(id)).toEqual(meta)
    }
  })

  it('marks local providers as not requiring API keys', () => {
    expect(providerSetupMeta('ollama')).toMatchObject({
      category: 'local',
      requiresApiKey: false,
      installUrl: 'https://ollama.com/download',
    })
    expect(providerSetupMeta('llamacpp')).toMatchObject({
      category: 'local',
      requiresApiKey: false,
    })
  })

  it('includes vendor console and docs URLs', () => {
    expect(providerSetupMeta('openai')).toMatchObject({
      category: 'vendor',
      requiresApiKey: true,
      consoleUrl: 'https://platform.openai.com/api-keys',
      defaultBaseUrl: 'https://api.openai.com/v1',
      keyPlaceholder: 'sk-…',
    })
    expect(providerSetupMeta('anthropic').docsUrl).toContain('anthropic.com')
  })

  it('includes wholesale provider defaults', () => {
    expect(providerSetupMeta('openrouter')).toMatchObject({
      category: 'wholesale',
      requiresApiKey: true,
      consoleUrl: 'https://openrouter.ai/keys',
      defaultBaseUrl: expect.stringContaining('openrouter.ai'),
    })
    expect(providerSetupMeta('groq').docsUrl).toContain('groq.com')
  })

  it('re-exports provider id lists', () => {
    expect(VENDOR_LLM_PROVIDER_IDS_LIST).toContain('openai')
    expect(WHOLESALE_LLM_PROVIDER_IDS_LIST).toContain('openrouter')
    expect(VENDOR_LLM_PROVIDER_IDS_LIST.length).toBeGreaterThan(0)
    expect(WHOLESALE_LLM_PROVIDER_IDS_LIST.length).toBeGreaterThan(0)
  })
})
