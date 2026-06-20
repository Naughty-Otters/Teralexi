/**
 * Picks one of three foreach-item strategies from flow config:
 * `hasTodoItems` preset → planned, `mode: 'expression'` → expression, else custom.
 */
import type { ForEachItemConfig } from '../foreach-item-config'
import {
  isCustomConfig,
  isExpressionConfig,
  ishasTodoItemsPreset,
  isPlanModeTodosPreset,
  isWebScrapePreset,
} from '../foreach-item-config'
import type { ForEachItemStrategy } from './types'
import { createCustomStrategy } from './strategies/custom-strategy'
import { createExpressionStrategy } from './strategies/expression-strategy'
import { createPlannedTodoStrategy } from './strategies/planned-todo-strategy'
import { createWebScrapeStrategy } from '../web-scrape/strategy'

export function resolveForEachItemStrategy(
  config: ForEachItemConfig,
): ForEachItemStrategy {
  if (ishasTodoItemsPreset(config) || isPlanModeTodosPreset(config)) {
    return createPlannedTodoStrategy(config)
  }
  if (isWebScrapePreset(config)) {
    return createWebScrapeStrategy(config)
  }
  if (isExpressionConfig(config)) {
    return createExpressionStrategy(config)
  }
  if (isCustomConfig(config)) {
    return createCustomStrategy(config)
  }
  throw new Error('Unsupported foreachItem config')
}
