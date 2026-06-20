import { describe, expect, it, vi } from 'vitest'
import {
  stepHookFromExpression,
  executeExpressionStep,
  StepExpressionDefinitionBase,
  type ExpressionStepDefinition,
} from './step-expr-base'
import type { AgentStepContext } from '../context'
import type { StepExpressionPlan } from './expression-plan'
import { THINKING_STEP_ID } from '../constants/step-ids'

vi.mock('./run-expression-llm', () => ({
  runExpressionLlmText: vi.fn(async () => 'llm-body'),
}))

function makeCtx(overrides?: Partial<{
  executionSteps: { planning: string }
  expressionPlan: { userPrompt: string }
}>): {
  ctx: {
    executionSteps?: { planning: string }
    flowStepConfig?: { expressionPlan?: { userPrompt: string } }
    currentMessages: { role: 'user'; content: string }[]
    stepId: string
    title: string
    beginStep: ReturnType<typeof vi.fn>
    emitStepProgress: ReturnType<typeof vi.fn>
    recordStepOutput: ReturnType<typeof vi.fn>
    appendAssistantTurn: ReturnType<typeof vi.fn>
  }
} {
  const ctx = {
    executionSteps: overrides?.executionSteps,
    flowStepConfig: overrides?.expressionPlan
      ? { expressionPlan: overrides.expressionPlan }
      : undefined,
    config: {
      withResponseLanguageInstruction: (text: string) => text,
    },
    opts: { responseLanguage: undefined },
    currentMessages: [{ role: 'user' as const, content: 'hello' }],
    stepId: THINKING_STEP_ID,
    title: 'Thinking',
    beginStep: vi.fn(),
    emitStepProgress: vi.fn(),
    recordStepOutput: vi.fn(),
    appendAssistantTurn: vi.fn(),
  }
  return { ctx: ctx as never }
}

describe('step-hook', () => {
  it('stepHookFromExpression passes expression plan to buildPlan through context', async () => {
    const buildPlan = vi.fn((ctx: { flowStepConfig?: { expressionPlan?: { userPrompt?: string } } }) => ({
      instructions: 'sys',
      userPrompt: ctx.flowStepConfig?.expressionPlan?.userPrompt,
    }))
    const hooks: ExpressionStepDefinition = {
      id: THINKING_STEP_ID,
      title: 'Thinking',
      buildPlan: buildPlan as ExpressionStepDefinition['buildPlan'],
      formatBody: (body) => `OUT:${body}`,
      stepGoal: 'goal',
      outcome: 'ok',
    }
    const def = stepHookFromExpression(hooks)
    const createStepContext = vi.fn((_id, title, config) => {
      const { ctx } = makeCtx()
      ctx.title = title
      ctx.flowStepConfig = config
      return ctx
    })
    await def.run({
      flow: { createStepContext, executionSteps: { planning: 'p' } } as never,
      config: { expressionPlan: { userPrompt: 'focus' } },
    })

    expect(buildPlan).toHaveBeenCalledWith(
      expect.objectContaining({ flowStepConfig: expect.objectContaining({ expressionPlan: { userPrompt: 'focus' } }) }),
    )
    expect(createStepContext).toHaveBeenCalledWith(
      THINKING_STEP_ID,
      'Thinking',
      expect.objectContaining({ expressionPlan: { userPrompt: 'focus' } }),
    )
  })

  it('StepHookBase uses default recordResult when not overridden', async () => {
    class MinimalStep extends StepExpressionDefinitionBase {
      readonly id = THINKING_STEP_ID
      readonly title = 'Thinking'
      protected defaultInstruction(): string {
        return 'sys'
      }
    }
    const { ctx } = makeCtx()
    await executeExpressionStep(ctx, new MinimalStep())
    expect(ctx.recordStepOutput).toHaveBeenCalledWith(
      THINKING_STEP_ID,
      'Thinking',
      { raw: 'llm-body' },
      'llm-body',
      undefined,
      undefined,
      undefined,
    )
  })

  it('executeExpressionStep uses custom recordResult when provided', async () => {
    const recordResult = vi.fn()
    const { ctx } = makeCtx()
    const hooks: ExpressionStepDefinition = {
      id: THINKING_STEP_ID,
      title: 'Thinking',
      buildPlan: () => ({ instructions: 'sys' }),
      recordResult,
    }
    await executeExpressionStep(ctx, hooks)
    expect(recordResult).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ body: 'llm-body', formatted: 'llm-body' }),
    )
    expect(ctx.recordStepOutput).not.toHaveBeenCalled()
  })
})
