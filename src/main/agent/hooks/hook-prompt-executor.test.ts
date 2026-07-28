import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HookInvocationContext } from '@shared/agent/hooks'
import { execPromptHook } from './hook-prompt-executor'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@main/agent/providers/adapters', () => ({
  createModelForProvider: vi.fn(() => ({ modelId: 'mock' })),
}))

import { generateText } from 'ai'

const ctx: HookInvocationContext = {
  event: 'beforeToolCall',
  toolName: 'read_file',
}

describe('parseHookModelChoice', () => {
  it('parses provider:model specs', async () => {
    const { parseHookModelChoice } = await import('./hook-prompt-executor')
    expect(parseHookModelChoice('openai:gpt-4o-mini')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
  })

  it('falls back to default provider when only model is set', async () => {
    const { parseHookModelChoice } = await import('./hook-prompt-executor')
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

  it('returns null when no model can be resolved', async () => {
    const { parseHookModelChoice } = await import('./hook-prompt-executor')
    expect(parseHookModelChoice(undefined)).toBeNull()
  })
})

describe('execPromptHook', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset()
  })

  it('blocks when credentials are missing', async () => {
    const result = await execPromptHook(
      {
        type: 'prompt',
        event: 'beforeToolCall',
        prompt: 'check policy',
        model: 'openai:gpt-4o-mini',
        source: 'test',
      },
      ctx,
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toContain('credentials')
  })

  it('blocks when model cannot be resolved', async () => {
    const result = await execPromptHook(
      {
        type: 'prompt',
        event: 'beforeToolCall',
        prompt: 'check policy',
        source: 'test',
      },
      ctx,
      { credentials: { openai: { apiKey: 'k' } } },
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toContain('model')
  })

  it('returns parsed hook output from model text', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify({
        continue: true,
        hookSpecificOutput: { additionalContext: 'careful' },
      }),
    } as never)

    const result = await execPromptHook(
      {
        type: 'prompt',
        event: 'afterToolCall',
        prompt: 'summarize',
        model: 'openai:gpt-4o-mini',
        source: 'test',
      },
      { event: 'afterToolCall', toolName: 'read_file' },
      { credentials: { openai: { apiKey: 'k' } } },
    )

    expect(result).toEqual({
      blocked: false,
      hookSpecificOutput: { additionalContext: 'careful' },
    })
  })

  it('blocks beforeToolCall when model returns continue=false', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify({ continue: false, stopReason: 'denied' }),
    } as never)

    const result = await execPromptHook(
      {
        type: 'prompt',
        event: 'beforeToolCall',
        prompt: 'check',
        model: 'openai:gpt-4o-mini',
        source: 'test',
      },
      ctx,
      { credentials: { openai: { apiKey: 'k' } } },
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toBe('denied')
  })

  it('blocks when model output is not valid JSON', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: 'plain text' } as never)

    const result = await execPromptHook(
      {
        type: 'prompt',
        event: 'beforeToolCall',
        prompt: 'check',
        model: 'openai:gpt-4o-mini',
        source: 'test',
      },
      ctx,
      { credentials: { openai: { apiKey: 'k' } } },
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toContain('non-JSON')
  })

  it('surfaces hook failures from generateText', async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error('rate limited'))

    const result = await execPromptHook(
      {
        type: 'prompt',
        event: 'beforeToolCall',
        prompt: 'check',
        model: 'openai:gpt-4o-mini',
        source: 'test',
      },
      ctx,
      { credentials: { openai: { apiKey: 'k' } } },
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toBe('Prompt hook failed: rate limited')
  })
})

