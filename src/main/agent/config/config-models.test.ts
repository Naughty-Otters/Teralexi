import { describe, expect, it } from 'vitest'
import { DEEPSEEK_MODELS, SYSTEM_PROP_KEYS, ZHIPU_MODELS } from './config'

describe('agent config models', () => {
  it('exports zhipu model list and system prop keys', () => {
    expect(ZHIPU_MODELS).toContain('glm-4.6')
    expect(ZHIPU_MODELS).toContain('glm-4-flash')
    expect(SYSTEM_PROP_KEYS.zhipuApiKey).toBe('settings.zhipu.apiKey')
    expect(SYSTEM_PROP_KEYS.zhipuBaseURL).toBe('settings.zhipu.baseUrl')
  })

  it('keeps deepseek models alongside zhipu', () => {
    expect(DEEPSEEK_MODELS.length).toBeGreaterThan(0)
    expect(ZHIPU_MODELS.length).toBeGreaterThan(0)
  })
})
