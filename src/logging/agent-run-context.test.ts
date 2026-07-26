import { describe, expect, it, vi } from 'vitest'
import {
  duplicateAgentRunLog,
  getAgentRunLogFilePath,
  runWithAgentRunLog,
} from './agent-run-context'

describe('agent-run-context (disabled)', () => {
  it('runWithAgentRunLog just invokes the callback', async () => {
    const fn = vi.fn(async () => 42)
    await expect(
      runWithAgentRunLog(
        {
          agentId: 'a',
          conversationId: 'c',
          assistantMessageId: 'm',
        },
        fn,
      ),
    ).resolves.toBe(42)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('duplicateAgentRunLog and getAgentRunLogFilePath are no-ops', () => {
    expect(() =>
      duplicateAgentRunLog({} as never, 'info', 'hello'),
    ).not.toThrow()
    expect(getAgentRunLogFilePath()).toBeUndefined()
  })
})
