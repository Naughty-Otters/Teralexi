import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readInjectorMessageMeta } from './injection-message-meta'
import {
  buildValidationRulesBlock,
  validationRulesInjector,
} from './injectors/validation-rules'
import {
  buildSkillSystemPropertiesBlock,
  skillSystemPropertiesInjector,
} from './injectors/skill-system-properties'
import {
  buildTaskTrackingBlock,
  taskTrackingInjector,
} from './injectors/task-tracking'
import { languageInjector } from './injectors/language'
import { previousStepInjector } from './injectors/previous-step'
import { stepGoalInjector } from './injectors/step-goal'
import { planModeInjector } from './injectors/plan-mode'

const isPlanModeActive = vi.fn()
const bootstrapPlanFileForConversation = vi.fn()
const resolvePlanModeInstructionBlock = vi.fn()
const resolvePlanModeInjectionMessage = vi.fn()
const resolvePlanModeActiveToolNames = vi.fn()
const isPlanExecutionActive = vi.fn()

vi.mock('../coding/plan-mode-state', () => ({
  bootstrapPlanFileForConversation: (...args: unknown[]) =>
    bootstrapPlanFileForConversation(...args),
  isPlanModeActive: (...args: unknown[]) => isPlanModeActive(...args),
  isPlanExecutionActive: (...args: unknown[]) => isPlanExecutionActive(...args),
}))

vi.mock('../coding/plan-mode-injection-content', () => ({
  resolvePlanModeInstructionBlock: (...args: unknown[]) =>
    resolvePlanModeInstructionBlock(...args),
  resolvePlanModeInjectionMessage: (...args: unknown[]) =>
    resolvePlanModeInjectionMessage(...args),
}))

vi.mock('../coding/plan-mode-active-tools', () => ({
  resolvePlanModeActiveToolNames: (...args: unknown[]) =>
    resolvePlanModeActiveToolNames(...args),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValues: vi.fn(() => ({
    'app.google.clientId': '123.apps.googleusercontent.com',
    'app.google.clientSecret': 'secret',
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('skill system properties injector', () => {
  const specs = [
    {
      key: 'app.google.clientId',
      label: 'Google OAuth client ID',
      type: 'string' as const,
    },
    {
      key: 'app.google.clientSecret',
      label: 'Google OAuth client secret',
      type: 'secret' as const,
    },
  ]

  it('builds a configuration block from declared specs', () => {
    const block = buildSkillSystemPropertiesBlock({
      opts: { systemProperties: specs },
    } as never)
    expect(block).toContain('### Skill configuration properties')
    expect(block).toContain('`app.google.clientId`')
    expect(block).toContain('configured (value hidden)')
  })

  it('applies only in tool loop when specs exist', () => {
    expect(
      skillSystemPropertiesInjector.applies({
        profile: { stage: 'toolLoop' },
        ctx: { opts: { systemProperties: specs } },
      } as never),
    ).toBe(true)
    expect(
      skillSystemPropertiesInjector.applies({
        profile: { stage: 'toolLoop' },
        ctx: { opts: {} },
      } as never),
    ).toBe(false)
  })
})

describe('validation rules injector', () => {
  it('builds a validation block and applies only in tool loop with rules', () => {
    expect(
      buildValidationRulesBlock({
        executionSteps: { validation: ['', 'First rule', ' Second rule '] },
      } as never),
    ).toBe(
      ['### Validation rules', '', '- First rule', '-  Second rule '].join(
        '\n',
      ),
    )

    expect(
      buildValidationRulesBlock({
        executionSteps: { validation: ['   '] },
      } as never),
    ).toBe('')

    expect(
      validationRulesInjector.applies({
        profile: { stage: 'toolLoop' },
        ctx: { executionSteps: { validation: ['must check'] } },
      } as never),
    ).toBe(true)
    expect(
      validationRulesInjector.applies({
        profile: { stage: 'toolLoop' },
        ctx: { executionSteps: { validation: ['   '] } },
      } as never),
    ).toBe(false)
    expect(
      validationRulesInjector.injectInstructions({
        ctx: { executionSteps: { validation: ['must check'] } },
      } as never),
    ).toContain('Validation rules')
  })
})

describe('task tracking injector', () => {
  it('builds plan and non-plan blocks and injects only for coding tool loops', () => {
    isPlanExecutionActive.mockReturnValue(false)
    expect(
      buildTaskTrackingBlock([{ name: 'update_todos' }], 'conv-1'),
    ).toContain('Task tracking (`update_todos`)')
    expect(buildTaskTrackingBlock([{ name: 'other_tool' }], 'conv-1')).toBe('')

    isPlanExecutionActive.mockReturnValue(true)
    expect(
      buildTaskTrackingBlock([{ name: 'update_todos' }], 'conv-1'),
    ).toContain('approved plan execution')

    expect(
      taskTrackingInjector.applies({
        profile: { stage: 'toolLoop', isCodingAgent: true },
      } as never),
    ).toBe(true)
    expect(
      taskTrackingInjector.applies({
        profile: { stage: 'toolLoop', isCodingAgent: false },
      } as never),
    ).toBe(false)
    expect(
      taskTrackingInjector.injectInstructions({
        tools: [{ name: 'update_todos' }],
        ctx: { opts: { conversationId: 'conv-1' } },
      } as never),
    ).toContain('Task tracking')
  })
})

describe('simple injectors', () => {
  it('uses the active response language, previous step, and step goal helpers', () => {
    expect(
      languageInjector.injectInstructions({
        ctx: {
          config: {
            withResponseLanguageInstruction: vi.fn(
              (text: string, language: string) => `${text}|${language}`,
            ),
          },
          opts: { responseLanguage: 'English' },
        },
        assembledInstructions: 'hello',
      } as never),
    ).toBe('hello|English')

    expect(
      previousStepInjector.applies({
        profile: { stage: 'todoExecution' },
        todo: { previousStepBlock: ' previous context ' },
      } as never),
    ).toBe(true)
    expect(
      previousStepInjector.injectInstructions({
        profile: { stage: 'todoExecution' },
        todo: { previousStepBlock: ' previous context ' },
      } as never),
    ).toBe('previous context')
    expect(
      previousStepInjector.injectInstructions({
        profile: { stage: 'toolLoop' },
        ctx: { renderPreviousStepContextBlock: () => ' rendered previous ' },
      } as never),
    ).toBe('rendered previous')

    expect(
      stepGoalInjector.applies({
        profile: { stage: 'todoExecution' },
      } as never),
    ).toBe(true)
    expect(
      stepGoalInjector.injectInstructions({
        todo: {
          stepGoal: 'Ship it',
          lastRetryContext: ' retry context ',
        },
      } as never),
    ).toContain('Ship it')
    expect(
      stepGoalInjector.injectInstructions({
        todo: undefined,
      } as never),
    ).toBeNull()
  })

  it('returns plan-mode injections and prepare-step outputs', () => {
    isPlanModeActive.mockReturnValue(true)
    resolvePlanModeInstructionBlock.mockReturnValue('plan instructions')
    resolvePlanModeInjectionMessage.mockReturnValue({
      role: 'assistant',
      content: 'plan message',
    })
    resolvePlanModeActiveToolNames.mockReturnValue([
      'update_todos',
      'exit_plan_mode',
    ])

    expect(
      planModeInjector.applies({
        profile: { stage: 'toolLoop', runDepth: 0 },
      } as never),
    ).toBe(true)
    expect(
      planModeInjector.injectInstructions({
        ctx: {
          opts: { conversationId: 'conv-1' },
          agentRun: { meta: { depth: 0 } },
          sandbox: { getRoot: () => ' /workspace ' },
        },
      } as never),
    ).toBe('plan instructions')
    expect(bootstrapPlanFileForConversation).toHaveBeenCalledWith(
      'conv-1',
      undefined,
      { sandboxRoot: '/workspace' },
    )

    const message = planModeInjector.injectUserMessage({
        profile: { stage: 'toolLoop', planModeUsesPrepareStep: false },
        ctx: {
          opts: { conversationId: 'conv-1' },
          agentRun: { meta: { depth: 0 } },
          sandbox: { getRoot: () => '/workspace' },
        },
        loopStep: 1,
        messages: [],
      } as never)
    expect(message).toMatchObject({ role: 'assistant', content: 'plan message' })
    expect(readInjectorMessageMeta(message!)).toMatchObject({
      injectorId: 'plan-mode',
    })

    expect(
      planModeInjector.onPrepareStep(
        {
          profile: { stage: 'toolLoop', planModeUsesPrepareStep: true },
          ctx: {
            opts: { conversationId: 'conv-1' },
            agentRun: { meta: { depth: 0 } },
            sandbox: { getRoot: () => '/workspace' },
          },
          loopStep: 2,
        } as never,
        {
          allToolNames: ['update_todos', 'other'],
          messages: ['existing'],
        } as never,
      ),
    ).toEqual({
      activeTools: ['update_todos', 'exit_plan_mode'],
      messages: [
        'existing',
        expect.objectContaining({
          role: 'assistant',
          content: 'plan message',
          teralexiInjectorMeta: expect.objectContaining({
            injectorId: 'plan-mode',
          }),
        }),
      ],
    })

    isPlanModeActive.mockReturnValue(false)
    resolvePlanModeInjectionMessage.mockReturnValue(null)
    expect(
      planModeInjector.onPrepareStep(
        {
          profile: { stage: 'toolLoop', planModeUsesPrepareStep: true },
          ctx: {
            opts: { conversationId: 'conv-2' },
            agentRun: { meta: { depth: 1 } },
            sandbox: { getRoot: () => '/workspace' },
          },
          loopStep: 3,
        } as never,
        { allToolNames: ['update_todos'], messages: [] } as never,
      ),
    ).toBeUndefined()
  })
})
