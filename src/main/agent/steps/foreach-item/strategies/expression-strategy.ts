/**
 * **Expression strategy** — DSL / fluent `forEachItem` path.
 *
 * | | Planned | Expression | Custom |
 * |---|---|---|---|
 * | Config | `{ preset: 'hasTodoItems' }` | `{ mode: 'expression', expression, itemsFrom }` | `{ itemsFrom, runItem }` |
 * | Per item | Tool loop + verify + retry | **Thin:** one `StepExpressionPlan` run only | Arbitrary callback |
 * | Verify / retry | Yes | **No** (by design) | Up to callback |
 * | Form prelude | Yes | Yes (when item maps to a planned todo) | No |
 *
 * Built by {@link forEachItemWithExpression}; merges `itemContext` into `userPrompt` per item.
 * Records per-item step output and assistant turn from expression result text.
 */
import type { AgentFlowContext, AgentStepContext } from '../../../context'
import { executeStepExpression } from '../../../expr/execute-expression'
import type { StepExpressionPlan } from '../../../expr/expression-plan'
import {
  FOREACH_ITEM_STEP_ID,
  FOREACH_ITEM_STEP_TITLE,
} from '../../../constants/step-ids'
import type { ForEachItemExpressionConfig } from '../../foreach-item-config'
import {
  resolvePlannedTodoForIndex,
  runTodoItemPrelude,
} from '../prelude'
import type { ForEachItemItemResult, ForEachItemStrategy } from '../types'

export function createExpressionStrategy(
  config: ForEachItemExpressionConfig,
): ForEachItemStrategy {
  const basePlan = config.expression

  return {
    shouldRun(ctx) {
      return config.itemsFrom(ctx as unknown as AgentFlowContext).length > 0
    },

    async onBatchStart(ctx) {
      const items = config.itemsFrom(ctx as unknown as AgentFlowContext)
      const start = config.startIndex ?? 0
      ctx.beginStep(
        FOREACH_ITEM_STEP_ID,
        ctx.flowStepConfig?.title?.trim() || FOREACH_ITEM_STEP_TITLE,
        { itemCount: items.length, startIndex: start },
      )
    },

    resolveItems(ctx) {
      const items = config.itemsFrom(ctx as unknown as AgentFlowContext)
      return { items, startIndex: config.startIndex ?? 0 }
    },

    itemTitle(_ctx, item, index) {
      return (
        config.itemTitle?.(item, index)?.trim() ||
        basePlan.title?.trim() ||
        undefined
      )
    },

    async runItem(flowCtx, item, index, stepCtx): Promise<ForEachItemItemResult> {
      const extra = config.itemContext?.(item, index)?.trim()
      const plan: StepExpressionPlan = {
        ...basePlan,
        userPrompt: [basePlan.userPrompt, extra].filter(Boolean).join('\n\n'),
      }
      const displayTitle =
        config.itemTitle?.(item, index)?.trim() ||
        plan.title?.trim() ||
        `Item ${index + 1}`

      const planning = stepCtx.stepOutputs?.planning
      const plannedTodo = resolvePlannedTodoForIndex(
        planning,
        item,
        index,
      )

      stepCtx.setHitlPausedAtStage(FOREACH_ITEM_STEP_ID)
      const pausedForForm = await runTodoItemPrelude(
        stepCtx,
        plannedTodo,
        index,
      )
      if (pausedForForm) {
        return { paused: true }
      }

      stepCtx.beginStep(
        FOREACH_ITEM_STEP_ID,
        displayTitle,
        { itemIndex: index },
        plan.userPrompt ?? plan.instructions,
      )

      const result = await executeStepExpression(stepCtx, plan)
      const rendered =
        result.text ||
        (result.toolOutputs.length > 0
          ? JSON.stringify(result.toolOutputs.at(-1), null, 2)
          : '')

      stepCtx.recordStepOutput(
        FOREACH_ITEM_STEP_ID,
        displayTitle,
        result,
        rendered,
        {
          itemIndex: index,
          expressionSuccess: result.success,
          failureReason: result.failureReason,
        },
        undefined,
        plan.userPrompt ?? plan.instructions,
        result.success ? 'ok' : (result.failureReason ?? 'failed'),
      )

      if (rendered.trim()) {
        stepCtx.appendAssistantTurn(rendered)
      }

      return {
        paused:
          flowCtx.hitlAwaitingApproval ||
          flowCtx.hitlAwaitingFormData ||
          stepCtx.hitlAwaitingApproval ||
          stepCtx.hitlAwaitingFormData,
      }
    },
  }
}
