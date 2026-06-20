import { describe, expect, it, vi } from 'vitest'
import {
  defaultPlanningTodoItems,
  isCustomConfig,
  isExpressionConfig,
  ishasTodoItemsPreset,
  resolveForEachItemConfig,
  type ForEachItemConfig,
} from './foreach-item-config'

describe('resolveForEachItemConfig', () => {
  it('reads foreachItem from flow config', () => {
    const config = {
      foreachItem: {
        itemsFrom: () => [1, 2],
        runItem: async () => undefined,
      },
    }
    expect(resolveForEachItemConfig(config)?.itemsFrom).toBeDefined()
  })

  it('returns undefined when foreachItem missing', () => {
    expect(resolveForEachItemConfig({})).toBeUndefined()
    expect(resolveForEachItemConfig(undefined)).toBeUndefined()
  })

  it('returns undefined when foreachItem is not an object', () => {
    expect(resolveForEachItemConfig({ foreachItem: 'nope' as never })).toBeUndefined()
  })

  it('defaultPlanningTodoItems reads planning.todoList', () => {
    const items = defaultPlanningTodoItems({
      stepOutputs: {
        planning: { finalGoal: 'g', todoList: [{ id: 1 }, { id: 2 }] },
      },
    } as never)
    expect(items).toHaveLength(2)
  })

  it('defaultPlanningTodoItems returns empty when no plan or thinking', () => {
    expect(defaultPlanningTodoItems({ stepOutputs: {} } as never)).toEqual([])
  })

  it('defaultPlanningTodoItems synthesizes one todo when planning stage was skipped', () => {
    const items = defaultPlanningTodoItems({
      stepOutputs: {
        thinking: {
          raw: '**Mode:** Planning',
          execution_mode: 'planning',
          goal: 'Fix auth bug',
          task: 'Investigate and fix login failure',
          context: [],
        },
      },
    } as never)
    expect(items).toHaveLength(1)
    expect(items[0]?.name).toBe('Investigate and fix login failure')
  })
})

describe('isExpressionConfig', () => {
  it('detects expression mode config', () => {
    expect(
      isExpressionConfig({
        mode: 'expression',
        itemsFrom: () => [],
        expression: { instructions: 'sys' },
      }),
    ).toBe(true)
  })

  it('rejects custom config', () => {
    const custom: ForEachItemConfig = {
      itemsFrom: () => [],
      runItem: async () => undefined,
    }
    expect(isExpressionConfig(custom)).toBe(false)
  })
})

describe('isCustomConfig', () => {
  it('detects itemsFrom + runItem without mode', () => {
    expect(
      isCustomConfig({
        itemsFrom: () => [],
        runItem: async () => undefined,
      }),
    ).toBe(true)
  })

  it('rejects expression config', () => {
    expect(
      isCustomConfig({
        mode: 'expression',
        itemsFrom: () => [],
        expression: { instructions: 'sys' },
      }),
    ).toBe(false)
  })
})

describe('ishasTodoItemsPreset', () => {
  it('detects hasTodoItems preset', () => {
    expect(ishasTodoItemsPreset({ preset: 'hasTodoItems' })).toBe(true)
  })

  it('rejects custom config', () => {
    const custom: ForEachItemConfig = {
      itemsFrom: () => [],
      runItem: async () => undefined,
    }
    expect(ishasTodoItemsPreset(custom)).toBe(false)
  })
})
