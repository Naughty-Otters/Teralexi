import { describe, expect, it, vi } from 'vitest'

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn((key: string, fallback: string) => {
    if (key === 'app.ui.locale') return 'zh-cn'
    return fallback
  }),
}))

describe('resolveResponseLanguageForAgent', () => {
  it('reads app locale from system config when agent override is absent', async () => {
    const { resolveResponseLanguageForAgent } = await import(
      './resolve-response-language'
    )
    expect(resolveResponseLanguageForAgent(undefined)).toBe('Simplified Chinese')
    expect(resolveResponseLanguageForAgent('French')).toBe('French')
  })
})
