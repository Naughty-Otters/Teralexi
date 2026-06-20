import type { AgentFlowContext, AgentStepContext } from '../context'
import type { TodoItem } from '../types'
import { latestThinkingStepData } from '../expr/thinking-utils'
import { PLANNING_STEP_ID } from '../constants/step-ids'
import type { StepExpressionPlan } from '../expr/expression-plan'
import type { PlanningStepData } from './step-io'

/** Slice of flow step config read by {@link ForEachItemOrchestrator} (avoids cycle with flow pipeline). */
export type ForEachItemFlowConfig = {
  foreachItem?: ForEachItemConfig
  title?: string
}

/** Built-in iteration over {@link PlanningResult.todoList}. */
export type ForEachItemhasTodoItemsPreset = {
  preset: 'hasTodoItems'
  startIndex?: number
}

/** Iterate todos from `plans/todos.json` after plan approval. */
export type ForEachItemPlanModeTodosPreset = {
  preset: 'hasPlanModeTodos'
  startIndex?: number
}

/** Scrape each hit from the prior {@link SEARCH_STEP_ID} step. */
export type ForEachItemWebScrapePreset = {
  preset: 'webScrape'
  startIndex?: number
  maxItems?: number
  maxChars?: number
}

/** Per-item {@link StepExpression} execution (DSL / fluent forEachItem callback). */
export type ForEachItemExpressionConfig = {
  mode: 'expression'
  itemsFrom: (ctx: AgentFlowContext) => readonly unknown[]
  expression: StepExpressionPlan
  startIndex?: number
  itemTitle?: (item: unknown, index: number) => string
  itemContext?: (item: unknown, index: number) => string
}

/** Iterate arbitrary items with a per-item runner. */
export type ForEachItemCustomConfig = {
  mode?: 'custom'
  itemsFrom: (ctx: AgentFlowContext) => readonly unknown[]
  startIndex?: number
  itemTitle?: (item: unknown, index: number) => string
  shouldRunItem?: (item: unknown, index: number) => boolean
  runItem: (
    stepCtx: AgentStepContext,
    item: unknown,
    index: number,
  ) => Promise<void>
}

export type ForEachItemConfig =
  | ForEachItemhasTodoItemsPreset
  | ForEachItemPlanModeTodosPreset
  | ForEachItemWebScrapePreset
  | ForEachItemExpressionConfig
  | ForEachItemCustomConfig

export function isWebScrapePreset(
  config: ForEachItemConfig,
): config is ForEachItemWebScrapePreset {
  return 'preset' in config && config.preset === 'webScrape'
}

export function ishasTodoItemsPreset(
  config: ForEachItemConfig,
): config is ForEachItemhasTodoItemsPreset {
  return 'preset' in config && config.preset === 'hasTodoItems'
}

export function isPlanModeTodosPreset(
  config: ForEachItemConfig,
): config is ForEachItemPlanModeTodosPreset {
  return 'preset' in config && config.preset === 'hasPlanModeTodos'
}

export function isExpressionConfig(
  config: ForEachItemConfig,
): config is ForEachItemExpressionConfig {
  return 'mode' in config && config.mode === 'expression'
}

export function isCustomConfig(
  config: ForEachItemConfig,
): config is ForEachItemCustomConfig {
  if (
    ishasTodoItemsPreset(config) ||
    isPlanModeTodosPreset(config) ||
    isWebScrapePreset(config) ||
    isExpressionConfig(config)
  ) {
    return false
  }
  return (
    'itemsFrom' in config &&
    typeof config.itemsFrom === 'function' &&
    'runItem' in config &&
    typeof config.runItem === 'function'
  )
}

export function resolveForEachItemConfig(
  config: ForEachItemFlowConfig | undefined,
): ForEachItemConfig | undefined {
  const raw = config?.foreachItem
  if (!raw || typeof raw !== 'object') return undefined
  return raw as ForEachItemConfig
}

export type PlanningTodoItemsContext = Pick<
  AgentFlowContext,
  'outputStore' | 'stepOutputs'
>

/** Synthesize one todo from thinking when pipeline Planning did not run. */
export function todosFromDirectThinking(ctx: PlanningTodoItemsContext): TodoItem[] {
  const thinking = latestThinkingStepData(ctx)
  if (!thinking) return []
  if (
    thinking.execution_mode === 'research' ||
    thinking.execution_mode === 'skill_chain'
  ) {
    return []
  }

  const name =
    thinking.task?.trim() ||
    thinking.goal?.trim() ||
    'Execute request'
  const descriptionParts = [
    thinking.task?.trim(),
    thinking.goal?.trim(),
    ...(thinking.context ?? []),
  ].filter(Boolean)
  const description = descriptionParts.join('\n') || name

  return [
    {
      id: 1,
      name,
      description,
      success_criteria: 'Request completed successfully.',
      fallback_plan: 'retry',
      status: 'pending',
    },
  ]
}

export function defaultPlanningTodoItems(ctx: PlanningTodoItemsContext): TodoItem[] {
  const fromStepOutputs = ctx.stepOutputs.planning?.todoList ?? []
  if (fromStepOutputs.length > 0) return fromStepOutputs
  const fromOutputStore =
    ctx.outputStore?.latest<PlanningStepData>(PLANNING_STEP_ID)?.todoList ?? []
  if (fromOutputStore.length > 0) return fromOutputStore
  return todosFromDirectThinking(ctx)
}

/** @deprecated Use {@link todosFromDirectThinking}. */
export const todosFromAgentCallThinking = todosFromDirectThinking
