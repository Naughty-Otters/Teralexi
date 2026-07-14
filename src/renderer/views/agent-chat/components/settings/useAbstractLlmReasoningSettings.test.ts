import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
  useAbstractLlmReasoningSettings,
} from './useAbstractLlmReasoningSettings'

describe('useAbstractLlmReasoningSettings', () => {
  it('exposes product fields and hides unsupported ones per provider', () => {
    const provider = ref<'gemini' | 'openai'>('gemini')
    const providerOptions = ref<
      Record<string, Record<string, unknown>> | undefined
    >(undefined)
    const { settings, support, setStrength, setShowThinking, setThinkingTokenBudget } =
      useAbstractLlmReasoningSettings({
        provider,
        providerOptions,
        onUpdate: (next) => {
          providerOptions.value = next
        },
      })

    expect(support.value).toEqual({
      strength: true,
      showThinking: true,
      thinkingTokenBudget: true,
    })

    setStrength('high')
    setShowThinking(true)
    setThinkingTokenBudget(4096)
    expect(settings.value).toEqual({
      strength: 'high',
      showThinking: true,
      thinkingTokenBudget: 4096,
    })
    expect(providerOptions.value?.google).toMatchObject({
      thinkingConfig: {
        thinkingLevel: 'high',
        includeThoughts: true,
        thinkingBudget: 4096,
      },
    })

    provider.value = 'openai'
    providerOptions.value = undefined
    expect(support.value).toEqual({
      strength: true,
      showThinking: false,
      thinkingTokenBudget: false,
    })
  })
})
