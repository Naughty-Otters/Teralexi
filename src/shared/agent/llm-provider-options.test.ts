import { describe, expect, it } from 'vitest'
import {
  buildLlmCallReasoningFields,
  writeReasoningUiValues,
} from './llm-provider-options'

describe('buildLlmCallReasoningFields', () => {
  it('emits top-level reasoning and strips overlapping OpenAI level keys', () => {
    const providerOptions = writeReasoningUiValues('openai', undefined, {
      level: 'high',
    })
    const fields = buildLlmCallReasoningFields('openai', providerOptions)
    expect(fields.reasoning).toBe('high')
    expect(fields.providerOptions?.openai?.reasoningEffort).toBeUndefined()
  })

  it('keeps Google budget/includeThoughts while stripping thinkingLevel', () => {
    const providerOptions = writeReasoningUiValues('gemini', undefined, {
      level: 'medium',
      includeThoughts: true,
      thinkingBudget: 2048,
    })
    const fields = buildLlmCallReasoningFields('gemini', providerOptions)
    expect(fields.reasoning).toBe('medium')
    const thinking = fields.providerOptions?.google?.thinkingConfig as
      | Record<string, unknown>
      | undefined
    expect(thinking?.thinkingLevel).toBeUndefined()
    expect(thinking?.includeThoughts).toBe(true)
    expect(thinking?.thinkingBudget).toBe(2048)
  })

  it('does not set top-level reasoning for OpenFDE-only max', () => {
    const providerOptions = writeReasoningUiValues('anthropic', undefined, {
      level: 'max',
      thinkingBudget: 4096,
    })
    const fields = buildLlmCallReasoningFields('anthropic', providerOptions)
    expect(fields.reasoning).toBeUndefined()
    expect(fields.providerOptions?.anthropic?.effort).toBe('max')
    expect(fields.providerOptions?.anthropic?.thinking).toEqual({
      type: 'enabled',
      budgetTokens: 4096,
    })
  })

  it('returns empty when no reasoning configured', () => {
    expect(buildLlmCallReasoningFields('openai', undefined)).toEqual({})
  })
})
