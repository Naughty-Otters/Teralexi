import type { ForEachItemFlowConfig } from './foreach-item-config'
import type { StepExpressionPlan } from '../expr/expression-plan'
import { isStepExpression } from '../expr/step-expression'
import type { StepExpression } from '../expr/step-expression'
import type { ForEachItemExpressionConfig } from './foreach-item-config'

export type ForEachItemExpressionOptions = {
  itemsFrom: ForEachItemExpressionConfig['itemsFrom']
  expression: StepExpression | StepExpressionPlan
  startIndex?: number
  itemTitle?: ForEachItemExpressionConfig['itemTitle']
  /** Appended to the expression user prompt for each item. */
  itemContext?: (item: unknown, index: number) => string
}

function resolveExpressionPlan(
  expression: StepExpression | StepExpressionPlan,
): StepExpressionPlan {
  if (isStepExpression(expression)) {
    return expression.toPlan()
  }
  return expression
}

/**
 * Runs a {@link StepExpression} once per item from a prior step.
 */
export function forEachItemWithExpression(
  options: ForEachItemExpressionOptions,
): ForEachItemFlowConfig {
  const config: ForEachItemExpressionConfig = {
    mode: 'expression',
    itemsFrom: options.itemsFrom,
    expression: resolveExpressionPlan(options.expression),
    startIndex: options.startIndex,
    itemTitle: options.itemTitle,
    itemContext: options.itemContext,
  }

  return { foreachItem: config }
}
