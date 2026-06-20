import { describe, expect, it } from 'vitest'
import {
  childSandboxOutputScope,
  getCurrentAgentRunScope,
  runWithAgentRunScope,
} from './run-scope'
import {
  getAgentRunSandboxOutputScope,
  getAgentRunSandboxRoot,
} from '../sandbox/run-context'

describe('runWithAgentRunScope', () => {
  it('restores parent sandbox root after nested scope', async () => {
    await runWithAgentRunScope(
      {
        runId: 'parent',
        depth: 0,
        sandboxRoot: '/parent-root',
        sandboxOutputScope: 'output/parent',
      },
      async () => {
        expect(getCurrentAgentRunScope()?.runId).toBe('parent')
        expect(getAgentRunSandboxRoot()).toBe('/parent-root')

        await runWithAgentRunScope(
          {
            runId: 'child',
            parentRunId: 'parent',
            depth: 1,
            sandboxRoot: '/parent-root',
            sandboxOutputScope: childSandboxOutputScope(
              getCurrentAgentRunScope(),
              'child',
            ),
          },
          async () => {
            expect(getCurrentAgentRunScope()?.runId).toBe('child')
            expect(getAgentRunSandboxOutputScope()).toContain('subRuns/child')
          },
        )

        expect(getCurrentAgentRunScope()?.runId).toBe('parent')
      },
    )
  })
})
