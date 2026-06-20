import { describe, expect, it } from 'vitest'
import { toRunWorkflowCompilerAgentIpcArgs } from './workflow-studio'

describe('toRunWorkflowCompilerAgentIpcArgs', () => {
  it('produces structured-clone-safe payloads (no Vue proxies)', () => {
    const reactiveLikeErrors = new Proxy(['entities.md: bad field'], {
      get(target, prop) {
        return Reflect.get(target, prop)
      },
    })

    const payload = toRunWorkflowCompilerAgentIpcArgs({
      conversationId: 'wf-studio-wf-1',
      workflowId: 'wf-1',
      assistantMessageId: 'a1',
      userId: 'default',
      pendingUserMessage: {
        id: 'u1',
        content: 'Build a daily joke workflow',
        createdAt: '2026-06-17T00:00:00.000Z',
      },
      compileHints: {
        mermaidError: null,
        entityErrors: reactiveLikeErrors as string[],
        validationErrors: ['workflow.md: missing step'],
      },
    })

    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload.compileHints?.entityErrors).toEqual(['entities.md: bad field'])
  })
})
