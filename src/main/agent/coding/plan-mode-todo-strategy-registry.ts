import type { ForEachItemStrategy } from '../steps/foreach-item/types'
import type {
  ForEachItemhasTodoItemsPreset,
  ForEachItemPlanModeTodosPreset,
} from '../steps/foreach-item-config'

type PlannedTodoPresetConfig =
  | ForEachItemhasTodoItemsPreset
  | ForEachItemPlanModeTodosPreset

export type PlannedTodoStrategyFactory = (
  config: PlannedTodoPresetConfig,
) => ForEachItemStrategy

let plannedTodoStrategyFactory: PlannedTodoStrategyFactory | null = null

/** Called from planned-todo-strategy module init (side-effect registration). */
export function registerPlannedTodoStrategyFactory(
  factory: PlannedTodoStrategyFactory,
): void {
  plannedTodoStrategyFactory = factory
}

export function getPlannedTodoStrategyFactory(): PlannedTodoStrategyFactory {
  if (!plannedTodoStrategyFactory) {
    throw new Error(
      'Planned todo strategy is not registered. Import planned-todo-strategy before running plan todo foreach.',
    )
  }
  return plannedTodoStrategyFactory
}

export function resetPlannedTodoStrategyFactoryForTests(): void {
  plannedTodoStrategyFactory = null
}
