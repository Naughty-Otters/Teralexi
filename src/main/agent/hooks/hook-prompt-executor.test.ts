import { describe, expect, it } from 'vitest'
import { parseHookModelChoice } from './hook-prompt-executor'

describe('parseHookModelChoice', () => {
  it('parses provider:model specs', () => {
    expect(parseHookModelChoice('openai:gpt-4o-mini')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
  })

  it('falls back to default provider when only model is set', () => {
    expect(
      parseHookModelChoice('gpt-4o-mini', {
        provider: 'openai',
        model: 'gpt-4o',
      }),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
  })

  it('returns null when no model can be resolved', () => {
    expect(parseHookModelChoice(undefined)).toBeNull()
  })
})
