import { createLogger, instrumentInstanceMethods } from '@main/logger'
import type { AgentStepContext } from '../context'
import type { StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import { AgentStep } from './agent-step'
import {
  FOREACH_ITEM_STEP_ID,
  FOREACH_ITEM_STEP_TITLE,
} from '../constants/step-ids'
import { resolveForEachItemConfig } from './foreach-item-config'
import { runForEachItemBatch } from './foreach-item/batch-runner'
import { resolveForEachItemStrategy } from './foreach-item/resolve-strategy'

const log = createLogger('agent.steps.foreach-item')

export class ForEachItemOrchestrator extends AgentStep {
  constructor(ctx: AgentStepContext) {
    super(ctx)
    instrumentInstanceMethods(this, log)
  }

  shouldRun(): boolean {
    const config = resolveForEachItemConfig(this.ctx.flowStepConfig)
    if (!config) return false
    return resolveForEachItemStrategy(config).shouldRun(this.ctx)
  }

  async execute(): Promise<void> {
    const config = resolveForEachItemConfig(this.ctx.flowStepConfig)
    if (!config) {
      log.warn(
        'ForEachItemOrchestrator.execute called without foreachItem config',
      )
      return
    }

    const strategy = resolveForEachItemStrategy(config)
    await runForEachItemBatch(this.ctx, strategy)
  }
}

/** Pipeline runner for {@link FOREACH_ITEM_STEP_ID} (registered via {@link createFlowStageRegistry}). */
export const foreachItemFlowStepDefinition: StepExpressionDefinition = {
  id: FOREACH_ITEM_STEP_ID,
  title: FOREACH_ITEM_STEP_TITLE,
  hitlPausePoint: true,
  run: async (run: StepRunContext) => {
    const step = new ForEachItemOrchestrator(
      run.flow.createStepContext(
        FOREACH_ITEM_STEP_ID,
        FOREACH_ITEM_STEP_TITLE,
        run.config,
      ),
    )
    if (step.shouldRun()) await step.execute()
  },
}
