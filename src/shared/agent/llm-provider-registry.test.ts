import { describe, expect, it } from 'vitest'
import {
  AGENT_PROVIDER_SQL_CHECK,
  LLM_PROVIDER_IDS,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDER_SETTINGS_OPTIONS,
  LOCAL_LLM_PROVIDER_IDS,
  VENDOR_LLM_PROVIDER_IDS,
  WHOLESALE_LLM_PROVIDER_IDS,
  emptyOpenAiCompatibleCredentials,
  isOpenAiCompatibleProvider,
  isProviderType,
  llmProviderCategory,
  llmProviderSettingsLabel,
  normalizeProviderBaseUrl,
  openAiCompatibleProviderConfigKeys,
  openAiCompatibleProviderMeta,
  resolveOpenAiCompatibleCredentials,
} from './llm-provider-registry'

describe('llm-provider-registry', () => {
  it('includes fireworks and openrouter in canonical provider ids', () => {
    expect(LLM_PROVIDER_IDS).toContain('fireworks')
    expect(LLM_PROVIDER_IDS).toContain('openrouter')
    expect(AGENT_PROVIDER_SQL_CHECK).toContain("'fireworks'")
    expect(AGENT_PROVIDER_SQL_CHECK).toContain("'openrouter'")
  })

  it('labels local and wholesale providers distinctly', () => {
    expect(llmProviderSettingsLabel('ollama')).toBe('Ollama (local)')
    expect(llmProviderSettingsLabel('llamacpp')).toBe('llama.cpp (local)')
    expect(llmProviderSettingsLabel('zhipu')).toBe('Zhipu GLM')
    expect(llmProviderSettingsLabel('fireworks')).toBe('Fireworks (wholesale)')
    expect(llmProviderSettingsLabel('openrouter')).toBe('OpenRouter (wholesale)')
    expect(llmProviderSettingsLabel('custom')).toBe('Custom (OpenAI-compatible) (wholesale)')
  })

  it('categorizes providers into local, vendor, and wholesale', () => {
    expect(LOCAL_LLM_PROVIDER_IDS).toEqual(['ollama', 'llamacpp'])
    expect(VENDOR_LLM_PROVIDER_IDS).toContain('openai')
    expect(VENDOR_LLM_PROVIDER_IDS).toContain('nvidia-nim')
    expect(WHOLESALE_LLM_PROVIDER_IDS).toEqual(['fireworks', 'openrouter', 'custom'])
    expect(llmProviderCategory('ollama')).toBe('local')
    expect(llmProviderCategory('openai')).toBe('vendor')
    expect(llmProviderCategory('fireworks')).toBe('wholesale')
  })

  it('detects provider types and openai-compatible providers', () => {
    expect(isProviderType('zhipu')).toBe(true)
    expect(isProviderType('unknown')).toBe(false)
    expect(isOpenAiCompatibleProvider('moonshot')).toBe(true)
    expect(isOpenAiCompatibleProvider('zhipu')).toBe(false)
  })

  it('normalizes provider base URLs', () => {
    expect(normalizeProviderBaseUrl('', 'https://api.example.com/v1')).toBe(
      'https://api.example.com/v1',
    )
    expect(normalizeProviderBaseUrl('https://api.example.com/v1/', 'x')).toBe(
      'https://api.example.com/v1',
    )
  })

  it('resolves openai-compatible credentials from config keys', () => {
    const meta = openAiCompatibleProviderMeta('qwen')
    const creds = resolveOpenAiCompatibleCredentials('qwen', {
      [meta.apiKeyConfigKey]: '  key  ',
      [meta.baseUrlConfigKey]: 'https://custom.example/v1/',
    })
    expect(creds.apiKey).toBe('key')
    expect(creds.baseURL).toBe('https://custom.example/v1')
  })

  it('builds settings options for every provider id', () => {
    expect(LLM_PROVIDER_SETTINGS_OPTIONS).toHaveLength(LLM_PROVIDER_IDS.length)
    expect(
      LLM_PROVIDER_SETTINGS_OPTIONS.find((option) => option.id === 'zhipu')?.label,
    ).toBe('Zhipu GLM')
  })

  it('lists openai-compatible config keys and empty credential defaults', () => {
    const keys = openAiCompatibleProviderConfigKeys()
    expect(keys).toContain('settings.moonshot.apiKey')
    expect(keys).toContain('settings.nvidiaNim.baseUrl')

    expect(keys).toContain('settings.fireworks.apiKey')
    expect(keys).toContain('settings.openrouter.baseUrl')

    const empty = emptyOpenAiCompatibleCredentials()
    expect(empty.moonshot.baseURL).toBe('https://api.moonshot.ai/v1')
    expect(empty.fireworks.baseURL).toBe('https://api.fireworks.ai/inference/v1')
    expect(empty.openrouter.baseURL).toBe('https://openrouter.ai/api/v1')
    expect(empty.custom.baseURL).toBe('')
    expect(empty.qwen.apiKey).toBe('')
  })
})
