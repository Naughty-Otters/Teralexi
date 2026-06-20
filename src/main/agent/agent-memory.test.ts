import { describe, expect, it } from 'vitest'
import {
  buildAgentExecutionContext,
  getAgentMemoryProvider,
  resolveAgentChatId,
} from './agent-memory'

describe('agent-memory', () => {
  it('buildAgentExecutionContext is safe when memory fields are empty', async () => {
    const ctx = await buildAgentExecutionContext(
      { userId: 'user-1' } as never,
      undefined,
    )
    expect(ctx).toEqual({ userId: 'user-1', metadata: { userId: 'user-1' } })
    expect(ctx._memoryAddition).toBeUndefined()
  })

  it('resolveAgentChatId prefers conversationId', () => {
    expect(
      resolveAgentChatId(
        { conversationId: 'conv-1', assistantMessageId: 'msg-1', userId: 'u' },
        'step-x',
      ),
    ).toBe('conv-1')
  })

  it('uses a shared InMemoryProvider', () => {
    expect(getAgentMemoryProvider()).toBe(getAgentMemoryProvider())
  })
})
