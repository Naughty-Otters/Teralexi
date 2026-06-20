import { describe, expect, it, vi } from 'vitest'
import { StepExpression } from '../expr/step-expression'

vi.mock('../expr/execute-expression', () => ({
  executeStepExpression: vi.fn(async () => ({
    success: true,
    text: 'done',
    toolOutputs: [],
  })),
}))

vi.mock('../form/todo-form-readiness', () => ({
  assessTodoFormReadiness: vi.fn(async () => ({
    sufficient: true,
    collectViaForm: false,
  })),
}))

import { forEachItemWithExpression } from './foreach-item-run'
import { createExpressionStrategy } from './foreach-item/strategies/expression-strategy'
import { isExpressionConfig } from './foreach-item-config'

describe('forEachItemWithExpression', () => {
  it('builds foreachItem config with mode expression and no runItem', () => {
    const built = forEachItemWithExpression({
      itemsFrom: () => [{ name: 'a' }],
      expression: new StepExpression().prompt('Do work').system_msg('Exec'),
      itemContext: (item) => JSON.stringify(item),
      itemTitle: () => 'Custom title',
    })

    expect(built.foreachItem).toBeDefined()
    expect(isExpressionConfig(built.foreachItem!)).toBe(true)
    expect(built.foreachItem).not.toHaveProperty('runItem')
    expect(built.foreachItem?.mode).toBe('expression')
  })

  it('expression strategy invokes executeStepExpression per item', async () => {
    const { executeStepExpression } = await import('../expr/execute-expression')
    const built = forEachItemWithExpression({
      itemsFrom: () => [{ k: 1 }, { k: 2 }],
      expression: { instructions: 'sys', userPrompt: 'base' },
    })

    const config = built.foreachItem!
    if (!isExpressionConfig(config)) throw new Error('expected expression config')
    const strategy = createExpressionStrategy(config)

    const parent = {
      stepOutputs: {},
      collectedFormByTodoId: {},
      beginStep: vi.fn(),
      recordStepOutput: vi.fn(),
      appendAssistantTurn: vi.fn(),
      hitlAwaitingApproval: false,
      hitlAwaitingFormData: false,
      flowStepConfig: {},
      createStepContext: vi.fn(function (this: unknown) {
        return { ...parent, form: parent.form, collectedFormByTodoId: parent.collectedFormByTodoId }
      }),
      form: {
        applyCollectFormResponsesToUiMessages: vi.fn(),
        maybePauseForFormBeforeTodoExecution: vi.fn(async () => false),
      },
    }

    await strategy.onBatchStart?.(parent as never)
    const { items } = strategy.resolveItems(parent as never)
    for (let i = 0; i < items.length; i++) {
      const stepCtx = {
        ...parent,
        stepOutputs: parent.stepOutputs,
        beginStep: vi.fn(),
        recordStepOutput: vi.fn(),
        appendAssistantTurn: vi.fn(),
        setHitlPausedAtStage: vi.fn(),
        form: parent.form,
      }
      await strategy.runItem(parent as never, items[i], i, stepCtx as never)
    }

    expect(executeStepExpression).toHaveBeenCalledTimes(2)
  })
})
