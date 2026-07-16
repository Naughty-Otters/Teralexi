import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPrepareStepFromInjectors } from '../injection'
import { PLAN_MODE_USER_TRIGGERS } from './plan-mode-injection-content'

vi.mock('./plan-mode-state', () => ({
  bootstrapPlanFileForConversation: vi.fn(() => null),
  isPlanModeActive: vi.fn(() => true),
  getPlanModeStateForConversation: vi.fn(() => ({
    status: 'planning',
    planSlug: 'test',
  })),
  resolvePlanModeStorage: vi.fn(() => null),
  consumePendingPlanActivation: vi.fn(() => false),
  consumePendingPlanExecution: vi.fn(() => false),
  hasPendingPlanActivation: vi.fn(() => false),
  hasPendingPlanExecution: vi.fn(() => false),
}))

vi.mock('./plan-mode-storage-impl', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./plan-mode-storage-impl')>()
  return {
    ...actual,
    resolvePlanModeStorage: vi.fn(() => null),
    readPlanModeTodoList: vi.fn(() => ({ todos: [] })),
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
  }
})

import { isPlanModeActive } from './plan-mode-state'

describe('createPrepareStepFromInjectors (plan mode)', () => {
  beforeEach(() => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
  })

  it('returns activeTools when plan mode is active', async () => {
    const prepareStep = createPrepareStepFromInjectors(
      {
        opts: { skillId: 'coding', conversationId: 'conv-1', userId: 'u' },
        agentRun: { meta: { depth: 0 } },
        runtimeTools: [],
        sandbox: {
          buildSandboxStructureBlock: () => '',
          buildWorkspaceStructureBlock: () => '',
          buildInstructionBlock: () => '',
        },
        config: {
          withResponseLanguageInstruction: (t: string) => t,
        },
        renderPreviousStepContextBlock: () => '',
      } as never,
      ['read_file', 'write_file', 'update_todos', 'run_workspace_command'],
    )
    expect(prepareStep).toBeDefined()

    const result = await prepareStep!({
      stepNumber: 1,
      messages: [{ role: 'user', content: 'hi' }],
      steps: [],
      model: {} as never,
      experimental_context: {},
    })

    expect(result?.activeTools).toEqual(['read_file', 'write_file', 'update_todos'])
    expect(result?.messages?.length).toBeGreaterThan(1)
    const injected = result?.messages?.at(-1)
    expect(injected?.role).toBe('user')
    expect(String(injected?.content)).toContain(PLAN_MODE_USER_TRIGGERS.continue)
    expect(String(injected?.content)).not.toContain('Explore mode is active.')
  })

  it('keeps activeTools but does not append continue user onto unanswered tool rounds', async () => {
    const prepareStep = createPrepareStepFromInjectors(
      {
        opts: { skillId: 'coding', conversationId: 'conv-1', userId: 'u' },
        agentRun: { meta: { depth: 0 } },
        runtimeTools: [],
        sandbox: {
          buildSandboxStructureBlock: () => '',
          buildWorkspaceStructureBlock: () => '',
          buildInstructionBlock: () => '',
        },
        config: {
          withResponseLanguageInstruction: (t: string) => t,
        },
        renderPreviousStepContextBlock: () => '',
      } as never,
      ['read_file', 'write_file', 'update_todos', 'enter_plan_mode'],
    )

    const result = await prepareStep!({
      stepNumber: 1,
      messages: [
        { role: 'user', content: 'plan' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'tc1',
              toolName: 'enter_plan_mode',
              input: {},
            },
            {
              type: 'tool-approval-request',
              approvalId: 'ap1',
              toolCallId: 'tc1',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            { type: 'tool-approval-response', approvalId: 'ap1', approved: true },
          ],
        },
      ],
      steps: [],
      model: {} as never,
      experimental_context: {},
    })

    expect(result?.activeTools).toEqual([
      'read_file',
      'write_file',
      'update_todos',
      'enter_plan_mode',
    ])
    expect(result?.messages).toBeUndefined()
  })

  it('returns a prepare step hook for non-coding skills (plan mode uses injectMessages)', () => {
    const prepareStep = createPrepareStepFromInjectors(
      { opts: { skillId: 'demo', userId: 'u' }, agentRun: { meta: { depth: 0 } } } as never,
      ['read_file'],
    )
    expect(prepareStep).toBeTypeOf('function')
  })
})
