import { describe, expect, it } from 'vitest'
import {
  formatSubAgentWorkspaceContext,
  mergeContextEnvelopeMessages,
  trimContextMessages,
} from '@shared/agent/sub-agent-context'

describe('sub-agent-context', () => {
  it('merges pipeline, thread, and task without duplicate content', () => {
    const merged = mergeContextEnvelopeMessages({
      rootRunId: 'root',
      parentRunId: 'root',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
      pipelineMessages: [{ role: 'user', content: 'Planning context' }],
      delegationTask: 'Do the thing',
    })
    expect(merged.at(-1)?.content).toBe('Do the thing')
    expect(merged.some((m) => m.content === 'Planning context')).toBe(true)
    expect(merged.some((m) => m.content === 'Hello')).toBe(true)
  })

  it('includes workspace path context for sub-agents', () => {
    const merged = mergeContextEnvelopeMessages({
      rootRunId: 'root',
      parentRunId: 'root',
      messages: [],
      pipelineMessages: [],
      workspacePath: '/Users/dev/project',
      delegationTask: 'Review search.ts',
    })
    expect(merged[0]?.content).toContain('/Users/dev/project')
    expect(merged.at(-1)?.content).toBe('Review search.ts')
    expect(formatSubAgentWorkspaceContext(undefined)).toBeNull()
  })

  it('slimContext omits parent thread and includes read ledger', () => {
    const merged = mergeContextEnvelopeMessages({
      rootRunId: 'root',
      parentRunId: 'root',
      messages: [{ role: 'user', content: 'long parent chat' }],
      pipelineMessages: [
        { role: 'user', content: 'p1' },
        { role: 'user', content: 'p2' },
        { role: 'user', content: 'p3' },
        { role: 'user', content: 'p4' },
        { role: 'user', content: 'p5' },
      ],
      workspacePath: '/repo',
      delegationTask: 'Find auth bugs',
      slimContext: true,
      readLedgerPaths: ['src/auth.ts', 'src/login.ts'],
    })
    expect(merged.some((m) => m.content === 'long parent chat')).toBe(false)
    expect(merged.some((m) => m.content === 'p1')).toBe(false)
    expect(merged.some((m) => m.content.includes('src/auth.ts'))).toBe(true)
    expect(merged.at(-1)?.content).toBe('Find auth bugs')
  })

  it('trimContextMessages keeps the task message at the tail', () => {
    const messages = [
      ...Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: `msg-${i}`,
      })),
      { role: 'user', content: 'final task' },
    ]
    const trimmed = trimContextMessages(messages, 5)
    expect(trimmed.at(-1)?.content).toBe('final task')
    expect(trimmed.length).toBeLessThanOrEqual(5)
  })
})
