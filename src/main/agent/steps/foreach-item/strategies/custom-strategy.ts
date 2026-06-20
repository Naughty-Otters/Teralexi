/**
 * **Custom strategy** — tests and ad-hoc extensions.
 *
 * | | Planned | Expression | Custom |
 * |---|---|---|---|
 * | Config | `{ preset: 'hasTodoItems' }` | `{ mode: 'expression', ... }` | `{ itemsFrom, runItem }` (no `mode` required) |
 * | Per item | Full orchestration | Declarative expression plan | **Delegates entirely to `config.runItem`** |
 * | Form / tool loop | Built-in | Expression + optional prelude only | Caller implements |
 * | Skip items | N/A (all todos) | N/A | Optional `shouldRunItem` |
 *
 * Backward compatible: configs with only `itemsFrom` + `runItem` resolve here.
 * Batch ends with a simple processed-N-items `recordStepOutput` on the flow ctx.
 */
import type { AgentFlowContext, AgentStepContext } from '../../../context'
import {
  FOREACH_ITEM_STEP_ID,
  FOREACH_ITEM_STEP_TITLE,
} from '../../../constants/step-ids'
import type { ForEachItemCustomConfig } from '../../foreach-item-config'
import type { ForEachItemStrategy } from '../types'

export function createCustomStrategy(
  config: ForEachItemCustomConfig,
): ForEachItemStrategy {
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

    shouldSkipItem(_ctx, item, index) {
      return config.shouldRunItem ? !config.shouldRunItem(item, index) : false
    },

    itemTitle(_ctx, item, index) {
      return config.itemTitle?.(item, index)
    },

    async runItem(_flowCtx, item, index, stepCtx) {
      await config.runItem(stepCtx, item, index)
      return {
        paused:
          stepCtx.hitlAwaitingApproval || stepCtx.hitlAwaitingFormData,
      }
    },

    async onBatchEnd(ctx) {
      const items = config.itemsFrom(ctx as unknown as AgentFlowContext)
      ctx.recordStepOutput(
        FOREACH_ITEM_STEP_ID,
        FOREACH_ITEM_STEP_TITLE,
        { itemCount: items.length, completedThrough: items.length },
        `Processed ${items.length} item(s).`,
      )
    },
  }
}
