import { createLogger } from '@main/logger'
import {
  FOREACH_ITEM_STEP_ID,
  FOREACH_ITEM_STEP_TITLE,
} from '../../constants/step-ids'
import type { AgentStepContext } from '../../context'
import type { ForEachItemStrategy } from './types'

const log = createLogger('agent.steps.foreach-item.batch')

export async function runForEachItemBatch(
  flowCtx: AgentStepContext,
  strategy: ForEachItemStrategy,
): Promise<void> {
  if (!strategy.shouldRun(flowCtx)) return

  await strategy.onBatchStart?.(flowCtx)

  const { items, startIndex } = strategy.resolveItems(flowCtx)

  for (let index = startIndex; index < items.length; index++) {
    const item = items[index]
    if (strategy.shouldSkipItem?.(flowCtx, item, index)) continue

    const title =
      strategy.itemTitle?.(flowCtx, item, index)?.trim() ||
      `Item ${index + 1} of ${items.length}`

    log.debug('runForEachItemBatch running item', { index, title })

    const stepCtx = flowCtx.createStepContext(
      FOREACH_ITEM_STEP_ID,
      title,
      flowCtx.flowStepConfig,
    )

    const result = await strategy.runItem(flowCtx, item, index, stepCtx)

    if (
      result.paused ||
      flowCtx.hitlAwaitingApproval ||
      flowCtx.hitlAwaitingFormData ||
      flowCtx.hitlAwaitingManualIntervention
    ) {
      flowCtx.setHitlPausedAtStage(FOREACH_ITEM_STEP_ID)
      log.info('runForEachItemBatch paused for HITL', { index })
      break
    }

    if (result.stopBatch) {
      log.info('runForEachItemBatch stopped by strategy', { index })
      break
    }
  }

  await strategy.onBatchEnd?.(flowCtx)
}
