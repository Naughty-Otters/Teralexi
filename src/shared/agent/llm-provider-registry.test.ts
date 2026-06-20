import { describe, expect, it } from 'vitest'
import {
  AGENT_PROVIDER_SQL_CHECK,
  LLM_PROVIDER_IDS,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDER_SETTINGS_OPTIONS,
  emptyOpenAiCompatibleCredentials,
  isOpenAiCompatibleProvider,
  isProviderType,
  llmProviderSettingsLabel,
  normalizeProviderBaseUrl,
  openAiCompatibleProviderConfigKeys,
  openAiCompatibleProviderMeta,
  resolveOpenAiCompatibleCredentials,
} from './llm-provider-registry'

describe('llm-provider-registry', () => {
  it('includes zhipu in canonical provider ids', () => {
    expect(LLM_PROVIDER_IDS).toContain('zhipu')
    expect(LLM_PROVIDER_LABELS.zhipu).toBe('Zhipu GLM')
    expect(AGENT_PROVIDER_SQL_CHECK).toContain("'zhipu'")
  })

  it('labels local providers distinctly', () => {
    expect(llmProviderSettingsLabel('ollama')).toBe('Ollama (local)')
    expect(llmProviderSettingsLabel('llamacpp')).toBe('llama.cpp (local)')
    expect(llmProviderSettingsLabel('zhipu')).toBe('Zhipu GLM')
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

    const empty = emptyOpenAiCompatibleCredentials()
    expect(empty.moonshot.baseURL).toBe('https://api.moonshot.cn/v1')
    expect(empty.qwen.apiKey).toBe('')
  })
})
