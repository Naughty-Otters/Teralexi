import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { runWithAgentRunScope } from '@main/agent/run/run-scope'
import {
  bindSubAgentDelegation,
  clearSubAgentDelegation,
  getSubAgentDelegation,
  resetSubAgentDelegationStack,
} from '@toolSet/sub-agents/delegation-context'

describe('sub-agent delegation concurrency', () => {
  beforeEach(() => {
    resetSubAgentDelegationStack()
  })
  afterEach(() => {
    resetSubAgentDelegationStack()
  })

  it('isolates concurrent root binds by ALS runId', async () => {
    const seen: string[] = []

    await Promise.all([
      runWithAgentRunScope({ runId: 'run-a', depth: 0 }, async () => {
        bindSubAgentDelegation({
          parentRun: { meta: { depth: 0, runId: 'run-a' } } as never,
          opts: { conversationId: 'a' },
          allowSubAgents: true,
        })
        await new Promise((r) => setTimeout(r, 20))
        seen.push(String(getSubAgentDelegation()?.opts?.conversationId))
        clearSubAgentDelegation()
      }),
      runWithAgentRunScope({ runId: 'run-b', depth: 0 }, async () => {
        bindSubAgentDelegation({
          parentRun: { meta: { depth: 0, runId: 'run-b' } } as never,
          opts: { conversationId: 'b' },
          allowSubAgents: true,
        })
        await new Promise((r) => setTimeout(r, 5))
        seen.push(String(getSubAgentDelegation()?.opts?.conversationId))
        clearSubAgentDelegation()
      }),
    ])

    expect(seen.sort()).toEqual(['a', 'b'])
    expect(getSubAgentDelegation()).toBeUndefined()
  })
})
