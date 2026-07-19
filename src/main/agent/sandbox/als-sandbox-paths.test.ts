import { describe, expect, it } from 'vitest'
import {
  getSandboxRootFromEnv,
  getConversationIdFromEnv,
  getAssistantMessageIdFromEnv,
} from './paths'
import { getSandboxOutputScopeFromEnv } from './tool-loop-output'
import {
  runWithAgentRunScope,
  agentRunEnvFromScope,
} from '../run/run-scope'
import { setAgentRunSandboxRoot } from './run-context'

describe('ALS-first sandbox path resolution', () => {
  it('prefers ALS sandbox root over process globals', async () => {
    const g = globalThis as unknown as Record<string, unknown>
    g.__TERALEXI_AGENT_SANDBOX_ROOT__ = '/wrong-global'
    process.env.TERALEXI_AGENT_SANDBOX_ROOT = '/wrong-env'

    await runWithAgentRunScope(
      {
        runId: 'run-a',
        depth: 0,
        sandboxRoot: '/als-root-a',
        conversationId: 'conv-a',
        assistantMessageId: 'asst-a',
        sandboxOutputScope: 'output/toolLoop/step-a',
      },
      async () => {
        expect(getSandboxRootFromEnv()).toBe('/als-root-a')
        expect(getConversationIdFromEnv()).toBe('conv-a')
        expect(getAssistantMessageIdFromEnv()).toBe('asst-a')
        expect(getSandboxOutputScopeFromEnv()).toBe('output/toolLoop/step-a')
        expect(agentRunEnvFromScope()).toMatchObject({
          TERALEXI_AGENT_SANDBOX_ROOT: '/als-root-a',
          TERALEXI_AGENT_CONVERSATION_ID: 'conv-a',
        })
      },
    )

    delete g.__TERALEXI_AGENT_SANDBOX_ROOT__
    delete process.env.TERALEXI_AGENT_SANDBOX_ROOT
  })

  it('isolates concurrent ALS scopes without exclusive lock', async () => {
    const seen: string[] = []
    await Promise.all([
      runWithAgentRunScope(
        { runId: 'run-1', depth: 0, sandboxRoot: '/sandbox-1' },
        async () => {
          setAgentRunSandboxRoot('/sandbox-1')
          await new Promise((r) => setTimeout(r, 20))
          seen.push(getSandboxRootFromEnv() ?? '')
        },
      ),
      runWithAgentRunScope(
        { runId: 'run-2', depth: 0, sandboxRoot: '/sandbox-2' },
        async () => {
          setAgentRunSandboxRoot('/sandbox-2')
          await new Promise((r) => setTimeout(r, 5))
          seen.push(getSandboxRootFromEnv() ?? '')
        },
      ),
    ])
    expect(seen.sort()).toEqual(['/sandbox-1', '/sandbox-2'])
  })
})
