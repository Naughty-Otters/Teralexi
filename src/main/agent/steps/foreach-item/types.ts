import type { AgentStepContext } from '../../context'

export type ForEachItemItemResult = {
  paused?: boolean
  stopBatch?: boolean
}

export interface ForEachItemStrategy {
  shouldRun(ctx: AgentStepContext): boolean
  onBatchStart?(ctx: AgentStepContext): Promise<void>
  resolveItems(ctx: AgentStepContext): {
    items: readonly unknown[]
    startIndex: number
  }
  shouldSkipItem?(ctx: AgentStepContext, item: unknown, index: number): boolean
  itemTitle?(
    ctx: AgentStepContext,
    item: unknown,
    index: number,
  ): string | undefined
  runItem(
    flowCtx: AgentStepContext,
    item: unknown,
    index: number,
    stepCtx: AgentStepContext,
  ): Promise<ForEachItemItemResult>
  onBatchEnd?(ctx: AgentStepContext): Promise<void>
}
