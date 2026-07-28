import { describe, expect, it, vi } from 'vitest'
import type { HookInvocationContext } from '@shared/agent/hooks'
import { execAgentHook } from './hook-agent-executor'

const ctx: HookInvocationContext = {
  event: 'beforeToolCall',
  toolName: 'read_file',
}

describe('execAgentHook', () => {
  it('skips when no parent run context is available', async () => {
    const result = await execAgentHook(
      { type: 'agent', event: 'beforeToolCall', agentId: 'judge', source: 'test' },
      ctx,
    )

    expect(result).toEqual({
      blocked: false,
      message: 'Agent hook skipped: no active parent run context',
    })
  })

  it('returns hook output when child agent returns valid JSON', async () => {
    const result = await execAgentHook(
      { type: 'agent', event: 'beforeToolCall', agentId: 'judge', source: 'test' },
      ctx,
      {
        hookDelegation: {
          parentRun: {
            executeChildAndMerge: vi.fn(async () => ({
              stepOutputs: {
                report: JSON.stringify({
                  continue: true,
                  hookSpecificOutput: { additionalContext: 'ok' },
                }),
              },
            })),
          },
          parentOpts: { conversationId: 'c1' },
        },
      },
    )

    expect(result).toEqual({
      blocked: false,
      hookSpecificOutput: { additionalContext: 'ok' },
    })
  })

  it('blocks when child agent returns continue=false', async () => {
    const result = await execAgentHook(
      { type: 'agent', event: 'beforeToolCall', agentId: 'judge', source: 'test' },
      ctx,
      {
        hookDelegation: {
          parentRun: {
            executeChildAndMerge: vi.fn(async () => ({
              stepOutputs: {
                report: JSON.stringify({
                  continue: false,
                  stopReason: 'denied',
                }),
              },
            })),
          },
          parentOpts: { conversationId: 'c1' },
        },
      },
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toBe('denied')
  })

  it('blocks when child agent output is not valid JSON', async () => {
    const result = await execAgentHook(
      { type: 'agent', event: 'beforeToolCall', agentId: 'judge', source: 'test' },
      ctx,
      {
        hookDelegation: {
          parentRun: {
            executeChildAndMerge: vi.fn(async () => ({
              stepOutputs: { report: 'not json' },
            })),
          },
          parentOpts: { conversationId: 'c1' },
        },
      },
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toBe('Agent hook did not return valid JSON')
  })

  it('blocks when child agent execution throws', async () => {
    const result = await execAgentHook(
      { type: 'agent', event: 'beforeToolCall', agentId: 'judge', source: 'test' },
      ctx,
      {
        hookDelegation: {
          parentRun: {
            executeChildAndMerge: vi.fn(async () => {
              throw new Error('boom')
            }),
          },
          parentOpts: { conversationId: 'c1' },
        },
      },
    )

    expect(result.blocked).toBe(true)
    expect(result.message).toBe('Agent hook failed: boom')
  })
})
