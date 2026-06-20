import { describe, expect, it } from 'vitest'
import {
  isPlanningTemplatePlaceholder,
  pickTodoPlanningFields,
  resolvePlannedTodoItem,
  sanitizePlanningField,
} from './planning-fields'

describe('sanitizePlanningField', () => {
  it('strips angle-bracket schema placeholders', () => {
    expect(sanitizePlanningField('<short task name>')).toBe('')
    expect(sanitizePlanningField('<detailed description of what to do>')).toBe(
      '',
    )
  })

  it('keeps real task text', () => {
    expect(sanitizePlanningField(' Scrape tags ')).toBe('Scrape tags')
  })
})

describe('pickTodoPlanningFields', () => {
  it('maps legacy keys and drops placeholders', () => {
    expect(
      pickTodoPlanningFields({
        task: '<short task name>',
        goal: 'Fetch homepage tags from quotes.toscrape.com',
      }),
    ).toEqual({
      name: '',
      description: 'Fetch homepage tags from quotes.toscrape.com',
      success_criteria: '',
    })
  })
})

describe('resolvePlannedTodoItem', () => {
  const plan = {
    finalGoal: 'Ship the demo',
    todoList: [
      { id: 1, name: 'Scrape', description: 'Get tags', success_criteria: 'File exists' },
      { id: 2, name: 'Sort', description: 'Run python', success_criteria: 'JSON sorted' },
    ],
  }

  it('prefers todoList row at batch index over stale passed item', () => {
    const stale = { id: 2, name: '', description: '', success_criteria: '' }
    const resolved = resolvePlannedTodoItem(plan, stale, 1)
    expect(resolved).toEqual(plan.todoList[1])
  })

  it('falls back to id match when index missing', () => {
    const resolved = resolvePlannedTodoItem(plan, { id: 1 })
    expect(resolved.name).toBe('Scrape')
  })
})

describe('isPlanningTemplatePlaceholder', () => {
  it('detects known schema phrases', () => {
    expect(isPlanningTemplatePlaceholder('<how to verify this task succeeded>')).toBe(
      true,
    )
    expect(isPlanningTemplatePlaceholder('Run the scraper')).toBe(false)
  })
})
