import { describe, expect, it, vi } from 'vitest'
import type { AgentResponseOpts } from '../types'
import { StageModelRegistry } from './stage-model-registry'

vi.mock('./adapters', () => ({
  createModelForProvider: vi.fn(
    (provider: string, model: string) => ({ provider, model }),
  ),
}))

function baseOpts(
  overrides: Partial<AgentResponseOpts> = {},
): AgentResponseOpts {
  return {
    provider: 'ollama',
    model: 'llama3',
    systemPrompt: '',
    messages: [],
    onChunk: () => {},
    userId: 'user-1',
    ollamaBaseURL: 'http://localhost:11434',
    llamacppBaseURL: '',
    llamacppApiKey: '',
    anthropicApiKey: '',
    anthropicBaseURL: '',
    openaiApiKey: '',
    openaiBaseURL: '',
    geminiApiKey: '',
    geminiBaseURL: '',
    deepseekApiKey: '',
    deepseekApiUrl: '',
    zhipuApiKey: '',
    zhipuBaseURL: '',
    openAiCompatible: {} as AgentResponseOpts['openAiCompatible'],
    ...overrides,
  }
}

describe('StageModelRegistry', () => {
  it('returns unified default for all stages', () => {
    const registry = StageModelRegistry.fromOpts(baseOpts())
    expect(registry.getChoice('explore')).toEqual({
      provider: 'ollama',
      model: 'llama3',
    })
    expect(registry.getChoice('toolLoop')).toEqual({
      provider: 'ollama',
      model: 'llama3',
    })
    expect(registry.getModel('explore')).toEqual({
      provider: 'ollama',
      model: 'llama3',
    })
  })

  it('returns per-stage overrides when routing mode is per_stage', () => {
    const registry = StageModelRegistry.fromOpts(
      baseOpts({
        stageLlm: {
          mode: 'per_stage',
          default: { provider: 'ollama', model: 'llama3' },
          stages: {
            explore: { provider: 'anthropic', model: 'claude-sonnet' },
            verifier: { provider: 'openai', model: 'gpt-4o' },
          },
        },
      }),
    )

    expect(registry.getChoice('explore')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
    })
    expect(registry.getChoice('toolLoop')).toEqual({
      provider: 'ollama',
      model: 'llama3',
    })
    expect(registry.getChoice('verifier')).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    })
    expect(registry.getModel('verifier')).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    })
  })
})
