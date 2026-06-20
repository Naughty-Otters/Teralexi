import { describe, expect, it } from 'vitest'
import {
  parseAgentStageLlmSettings,
  parseStageLlmOverrides,
  resolveStageLlmChoice,
  resolveToolLoopExecutionChoice,
  hasToolLoopRecoveryOverride,
  serializeStageLlmOverrides,
} from './stage-llm-settings'

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
