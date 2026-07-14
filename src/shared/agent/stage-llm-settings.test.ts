import { describe, expect, it } from 'vitest'
import {
  parseAgentStageLlmSettings,
  parseStageLlmDocument,
  parseStageLlmOverrides,
  resolveStageLlmChoice,
  resolveToolLoopExecutionChoice,
  hasToolLoopRecoveryOverride,
  serializeStageLlmDocument,
  serializeStageLlmOverrides,
} from './stage-llm-settings'
import {
  aiSdkProviderOptionsNamespace,
  readReasoningUiValues,
  resolveAiSdkProviderOptions,
  setProviderOptionsSlice,
  writeReasoningUiValues,
} from './llm-provider-options'

describe('stage-llm-settings', () => {
  it('defaults to unified mode when routing mode missing', () => {
    const settings = parseAgentStageLlmSettings({
      provider: 'openai',
      model: 'gpt-4',
    })
    expect(settings.mode).toBe('unified')
    expect(settings.default).toEqual({ provider: 'openai', model: 'gpt-4' })
  })

  it('parses per-stage overrides from JSON', () => {
    const settings = parseAgentStageLlmSettings({
      provider: 'openai',
      model: 'gpt-4',
      routingMode: 'per_stage',
      stageLlmJson: JSON.stringify({
        explore: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        verifier: { provider: 'gemini', model: 'gemini-2.0-flash' },
      }),
    })
    expect(settings.mode).toBe('per_stage')
    expect(settings.stages?.explore).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
    expect(settings.stages?.toolLoop).toBeUndefined()
  })

  it('parses providerOptions on default and stage choices', () => {
    const settings = parseAgentStageLlmSettings({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      routingMode: 'per_stage',
      stageLlmJson: serializeStageLlmDocument({
        defaultProviderOptions: {
          google: { thinkingConfig: { thinkingBudget: 1024 } },
        },
        stages: {
          toolLoop: {
            provider: 'openai',
            model: 'gpt-4.1',
            providerOptions: {
              openai: { reasoningEffort: 'high' },
            },
          },
        },
      }),
    })
    expect(settings.default.providerOptions).toEqual({
      google: { thinkingConfig: { thinkingBudget: 1024 } },
    })
    expect(resolveStageLlmChoice(settings, 'toolLoop').providerOptions).toEqual(
      {
        openai: { reasoningEffort: 'high' },
      },
    )
  })

  it('resolveStageLlmChoice uses override in per_stage mode', () => {
    const settings = parseAgentStageLlmSettings({
      provider: 'openai',
      model: 'gpt-4',
      routingMode: 'per_stage',
      stageLlmJson: serializeStageLlmOverrides({
        toolLoop: { provider: 'deepseek', model: 'deepseek-chat' },
      }),
    })
    expect(resolveStageLlmChoice(settings, 'toolLoop')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    })
    expect(resolveStageLlmChoice(settings, 'explore')).toEqual({
      provider: 'openai',
      model: 'gpt-4',
    })
  })

  it('resolveStageLlmChoice ignores overrides in unified mode', () => {
    const settings = parseAgentStageLlmSettings({
      provider: 'openai',
      model: 'gpt-4',
      routingMode: 'unified',
      stageLlmJson: serializeStageLlmOverrides({
        verifier: { provider: 'gemini', model: 'gemini-pro' },
      }),
    })
    expect(resolveStageLlmChoice(settings, 'verifier')).toEqual({
      provider: 'openai',
      model: 'gpt-4',
    })
  })

  it('serializeStageLlmOverrides drops empty models', () => {
    expect(
      serializeStageLlmOverrides({
        explore: { provider: 'openai', model: '  ' },
        verifier: { provider: 'anthropic', model: 'claude' },
      }),
    ).toBe(JSON.stringify({ verifier: { provider: 'anthropic', model: 'claude' } }))
  })

  it('serializeStageLlmDocument keeps default providerOptions', () => {
    const raw = serializeStageLlmDocument({
      defaultProviderOptions: {
        google: { thinkingConfig: { includeThoughts: true } },
      },
      stages: {},
    })
    expect(parseStageLlmDocument(raw)).toEqual({
      defaultProviderOptions: {
        google: { thinkingConfig: { includeThoughts: true } },
      },
      stages: {},
    })
  })

  it('parseStageLlmOverrides returns empty on invalid JSON', () => {
    expect(parseStageLlmOverrides('not-json')).toEqual({})
  })

  it('resolveToolLoopExecutionChoice uses toolLoop by default', () => {
    const settings = parseAgentStageLlmSettings({
      provider: 'openai',
      model: 'gpt-4',
      routingMode: 'per_stage',
      stageLlmJson: serializeStageLlmOverrides({
        toolLoop: { provider: 'deepseek', model: 'deepseek-chat' },
      }),
    })
    expect(resolveToolLoopExecutionChoice(settings, false)).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    })
    expect(resolveToolLoopExecutionChoice(settings, true)).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    })
  })

  it('resolveToolLoopExecutionChoice uses recovery override when configured', () => {
    const settings = parseAgentStageLlmSettings({
      provider: 'openai',
      model: 'gpt-4',
      routingMode: 'per_stage',
      stageLlmJson: serializeStageLlmOverrides({
        toolLoop: { provider: 'deepseek', model: 'deepseek-chat' },
        toolLoopRecovery: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      }),
    })
    expect(resolveToolLoopExecutionChoice(settings, false)).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
    })
    expect(resolveToolLoopExecutionChoice(settings, true)).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
    expect(hasToolLoopRecoveryOverride(settings.stages)).toBe(true)
  })
})

describe('llm-provider-options', () => {
  it('maps gemini to the google providerOptions namespace', () => {
    expect(aiSdkProviderOptionsNamespace('gemini')).toBe('google')
    expect(
      setProviderOptionsSlice('gemini', {
        thinkingConfig: { thinkingBudget: 2048 },
      }),
    ).toEqual({
      google: { thinkingConfig: { thinkingBudget: 2048 } },
    })
  })

  it('writes gemini thinkingLevel, includeThoughts, and thinkingBudget', () => {
    const options = writeReasoningUiValues('gemini', undefined, {
      level: 'high',
      includeThoughts: true,
      thinkingBudget: 8192,
    })
    expect(readReasoningUiValues('gemini', options)).toEqual({
      level: 'high',
      includeThoughts: true,
      thinkingBudget: 8192,
    })
    expect(resolveAiSdkProviderOptions(options)).toEqual({
      google: {
        thinkingConfig: {
          thinkingLevel: 'high',
          includeThoughts: true,
          thinkingBudget: 8192,
        },
      },
    })
  })

  it('writes openai reasoningEffort and keeps UI-only fields off the wire', () => {
    const options = writeReasoningUiValues('openai', undefined, {
      level: 'medium',
      includeThoughts: true,
      thinkingBudget: 2048,
    })
    expect(readReasoningUiValues('openai', options)).toEqual({
      level: 'medium',
      includeThoughts: true,
      thinkingBudget: 2048,
    })
    expect(resolveAiSdkProviderOptions(options)).toEqual({
      openai: { reasoningEffort: 'medium' },
    })
  })

  it('writes anthropic effort and thinking budgetTokens', () => {
    const options = writeReasoningUiValues('anthropic', undefined, {
      level: 'high',
      thinkingBudget: 4096,
    })
    expect(resolveAiSdkProviderOptions(options)).toEqual({
      anthropic: {
        effort: 'high',
        thinking: { type: 'enabled', budgetTokens: 4096 },
      },
    })
  })
})