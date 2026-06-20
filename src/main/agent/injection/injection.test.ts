import { describe, expect, it } from 'vitest'
import {
  injectMessages,
  wrapSystemReminder,
  createPrepareStepFromInjectors,
} from './index'
import type { AgentStepContext } from '../context'

function makeCtx(skillId?: string): AgentStepContext {
  return {
    opts: {
      skillId,
      conversationId: 'conv-1',
      userId: 'user-1',
    },
    model: {},
    runtimeTools: [],
    sandbox: {
      buildSandboxStructureBlock: () => '',
      buildWorkspaceStructureBlock: () => '',
      buildInstructionBlock: () => '',
      getRoot: () => '',
    },
    getLatestUserMessageContent: () => '',
    config: {
      withResponseLanguageInstruction: (text: string) => text,
    },
    renderPreviousStepContextBlock: () => '',
  } as AgentStepContext
}

describe('injection framework', () => {
  it('wrapSystemReminder wraps content as a bold user message', () => {
    const msg = wrapSystemReminder('hello')
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('**hello**')
  })

  it('skips plan message injection when prepareStep handles it', async () => {
    const messages = await injectMessages(
      {
        opts: { skillId: 'coding', conversationId: 'conv-plan', userId: 'u' },
        model: {},
        agentRun: { meta: { depth: 0 } },
        runtimeTools: [],
        sandbox: {
          buildSandboxStructureBlock: () => '',
          buildWorkspaceStructureBlock: () => '',
          buildInstructionBlock: () => '',
          getRoot: () => '',
        },
        getLatestUserMessageContent: () => '',
        config: {
          withResponseLanguageInstruction: (t: string) => t,
        },
        renderPreviousStepContextBlock: () => '',
      } as AgentStepContext,
      [{ role: 'user', content: 'hi' }],
      0,
    )
    expect(messages).toHaveLength(1)
  })

  it('skips injection for non-coding skills', async () => {
    const messages = await injectMessages(
      makeCtx('demo'),
      [{ role: 'user', content: 'hi' }],
      0,
    )
    expect(messages).toHaveLength(1)
  })

  it('createPrepareStepFromInjectors registers plan-mode hook for non-coding skills', () => {
    expect(
      createPrepareStepFromInjectors(makeCtx('demo'), ['read_file']),
    ).toBeTypeOf('function')
  })
})
