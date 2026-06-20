import { describe, expect, it } from 'vitest'
import {
  normalizePlanningOutput,
} from './agent-parsing'

describe('normalizePlanningOutput', () => {
  it('normalizes todos with per-todo and global references', () => {
    const { finalGoal, todoItems } = normalizePlanningOutput({
      finalGoal: '  Goal  ',
      reference_doc: [{ name: 'global', reference_url: 'docs/a.md' }],
      reference_scripts: [
        { script_type: 'py', reference_url: 'scripts/run.py' },
      ],
      todoList: [
        {
          name: 'Task A',
          description: 'Do A',
          success_criteria: 'A done',
          fallback_plan: 'skip',
          reference_doc: [{ name: 'local', reference_url: 'form/x.md' }],
        },
        {
          name: 'Task B',
          description: 'Do B',
          fallback_plan: 'invalid',
        },
      ],
    })

    expect(finalGoal).toBe('Goal')
    expect(todoItems).toHaveLength(2)
    expect(todoItems[0]).toMatchObject({
      name: 'Task A',
      fallback_plan: 'skip',
      reference_doc: [{ reference_url: 'form/x.md' }],
    })
    expect(todoItems[0].reference_scripts[0]).toMatchObject({
      script_type: 'python',
      reference_url: 'scripts/run.py',
    })
    expect(todoItems[1].fallback_plan).toBe('retry')
    expect(todoItems[1].reference_doc).toEqual([
      { reference_url: 'docs/a.md' },
    ])
  })

  it('drops planning schema placeholders from todos', () => {
    const { todoItems } = normalizePlanningOutput({
      finalGoal: '<single clear sentence describing the desired end state>',
      todoList: [
        {
          name: '<short task name>',
          description: 'Scrape tags from the homepage',
        },
      ],
    })
    expect(todoItems).toHaveLength(1)
    expect(todoItems[0].name).toBe('Step 1')
    expect(todoItems[0].description).toBe('Scrape tags from the homepage')
  })

  it('accepts todoItems alias for todoList', () => {
    const { todoItems } = normalizePlanningOutput({
      todoItems: [{ name: 'From alias', description: 'Body' }],
    })
    expect(todoItems[0].name).toBe('From alias')
  })

  it('infers reference_scripts from todo description when planner omitted the array', () => {
    const { todoItems } = normalizePlanningOutput({
      finalGoal: 'Sort quotes',
      todoList: [
        {
          name: 'Sort matches',
          description: 'Run scripts/sort_script.py on quotes-raw.json',
          success_criteria: 'quotes-sorted.json exists',
        },
      ],
    })
    expect(todoItems[0]?.reference_scripts).toEqual([
      { script_type: 'python', reference_url: 'scripts/sort_script.py' },
    ])
  })

  it('parses string entries in reference_scripts arrays', () => {
    const { todoItems } = normalizePlanningOutput({
      todoList: [
        {
          name: 'Run',
          description: 'Execute',
          reference_scripts: ['scripts/run.sh'],
        },
      ],
    })
    expect(todoItems[0]?.reference_scripts[0]).toMatchObject({
      script_type: 'bash',
      reference_url: 'scripts/run.sh',
    })
  })

  it('accepts task alias for todo name', () => {
    const { todoItems } = normalizePlanningOutput({
      todoList: [{ task: 'Collect form', description: 'Show quote search UI' }],
    })
    expect(todoItems[0].name).toBe('Collect form')
  })

  it('normalizes root-level expectations array', () => {
    const { expectations } = normalizePlanningOutput({
      finalGoal: 'Deliver report',
      expectations: [
        'All todos completed successfully',
        'Output matches refs/report-format.md',
      ],
      todoList: [],
    })
    expect(expectations).toEqual([
      'All todos completed successfully',
      'Output matches refs/report-format.md',
    ])
  })

  it('accepts legacy expectation key as alias', () => {
    const { expectations } = normalizePlanningOutput({
      expectation: ['Every todo succeeded'],
      todoList: [{ name: 'A', description: 'Do A' }],
    })
    expect(expectations).toEqual(['Every todo succeeded'])
  })

  it('accepts legacy path field on reference docs', () => {
    const { todoItems } = normalizePlanningOutput({
      todoList: [
        {
          name: 'T',
          reference_doc: [{ name: 'f', path: 'skills/f.md' }],
        },
      ],
    })
    expect(todoItems[0].reference_doc[0].reference_url).toBe('skills/f.md')
  })
})
