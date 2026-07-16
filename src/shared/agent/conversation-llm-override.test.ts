import { describe, expect, it } from 'vitest'
import {
  mergeAgentStageLlmWithOverride,
  parseConversationLlmOverrideJson,
  resolveRunLlmFromAgentAndOverride,
  serializeConversationLlmOverride,
  toPlainConversationLlmOverride,
} from './conversation-llm-override'
import type { AgentStageLlmSettings } from './stage-llm-settings'

const agentDefaultWithReasoning: AgentStageLlmSettings = {
  mode: 'per_stage',
  default: {
    provider: 'openai',
    model: 'gpt-4.1',
    providerOptions: {
      openai: { reasoningEffort: 'low' },
    },
  },
  stages: {
    toolLoop: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  },
}

describe('conversation-llm-override', () => {
  it('round-trips override JSON with providerOptions', () => {
    const raw = serializeConversationLlmOverride({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'high' } },
      },
    })
    expect(parseConversationLlmOverrideJson(raw)).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'high' } },
      },
    })
  })

  it('toPlainConversationLlmOverride produces structured-cloneable data', () => {
    const plain = toPlainConversationLlmOverride({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true } },
      },
    })
    expect(() => structuredClone(plain)).not.toThrow()
    expect(plain).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true } },
      },
    })
  })

  it('override replaces agent default provider/model/providerOptions', () => {
    const merged = mergeAgentStageLlmWithOverride(agentDefaultWithReasoning, {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'high',
            includeThoughts: true,
          },
        },
      },
    })

    expect(merged.mode).toBe('per_stage')
    expect(merged.default).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'high',
            includeThoughts: true,
          },
        },
      },
    })
    // Agent-default openai reasoningEffort must not leak into the override.
    expect(merged.default.providerOptions).not.toHaveProperty('openai')
    // Per-stage choices stay as configured on the agent.
    expect(merged.stages?.toolLoop).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
  })

  it('null/undefined override keeps agent default settings (toggle off)', () => {
    expect(
      mergeAgentStageLlmWithOverride(agentDefaultWithReasoning, null),
    ).toEqual(agentDefaultWithReasoning)
    expect(
      mergeAgentStageLlmWithOverride(agentDefaultWithReasoning, undefined),
    ).toEqual(agentDefaultWithReasoning)
    expect(serializeConversationLlmOverride(null)).toBe('null')
    expect(parseConversationLlmOverrideJson('null')).toBeNull()
    expect(parseConversationLlmOverrideJson(null)).toBeNull()
  })

  it('resolveRunLlmFromAgentAndOverride applies override for the run', () => {
    const resolved = resolveRunLlmFromAgentAndOverride(
      {
        provider: 'openai',
        model: 'gpt-4.1',
        stageLlmSettings: agentDefaultWithReasoning,
      },
      {
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        providerOptions: {
          google: { thinkingConfig: { thinkingLevel: 'medium' } },
        },
      },
    )
    expect(resolved.provider).toBe('gemini')
    expect(resolved.model).toBe('gemini-2.5-pro')
    expect(resolved.stageLlm.default).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'medium' } },
      },
    })
    expect(resolved.stageLlm.stages?.toolLoop).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
  })

  it('resolveRunLlmFromAgentAndOverride without override uses agent defaults', () => {
    const resolved = resolveRunLlmFromAgentAndOverride(
      {
        provider: 'openai',
        model: 'gpt-4.1',
        stageLlmSettings: agentDefaultWithReasoning,
      },
      null,
    )
    expect(resolved.provider).toBe('openai')
    expect(resolved.model).toBe('gpt-4.1')
    expect(resolved.stageLlm).toEqual(agentDefaultWithReasoning)
    expect(resolved.stageLlm.default.providerOptions).toEqual({
      openai: { reasoningEffort: 'low' },
    })
  })

  it('resolveRunLlmFromAgentAndOverride builds settings from agent provider/model when stageLlmSettings missing', () => {
    const resolved = resolveRunLlmFromAgentAndOverride(
      { provider: 'ollama', model: 'llama3.2' },
      { provider: 'openai', model: 'gpt-4.1-mini' },
    )
    expect(resolved.provider).toBe('openai')
    expect(resolved.model).toBe('gpt-4.1-mini')
    expect(resolved.stageLlm.mode).toBe('unified')
    expect(resolved.stageLlm.default).toEqual({
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })
  })
})
