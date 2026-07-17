import { describe, expect, it } from 'vitest'
import {
  emptyTodoList,
  mergeExecutionTodoStatuses,
  normalizeTodos,
  parseTodoList,
  renderTodoChecklist,
  replaceTodos,
  seedTodoListFromTitles,
  summarizeTodos,
  todosFileName,
  todosNamespaceFromScope,
} from './todos'

const NOW = '2026-01-01T00:00:00.000Z'

describe('normalizeTodos', () => {
  it('assigns sequential ids, drops empty content, defaults status', () => {
    const todos = normalizeTodos([
      { content: 'first' },
      { content: '   ' },
      { content: 'second', status: 'in_progress' },
      { content: 'third', status: 'bogus' },
    ])
    expect(todos).toEqual([
      { id: 't1', content: 'first', status: 'pending' },
      { id: 't2', content: 'second', status: 'in_progress' },
      { id: 't3', content: 'third', status: 'pending' },
    ])
  })

  it('preserves optional verification fields and drops empty strings', () => {
    const todos = normalizeTodos([
      {
        content: 'Add auth',
        success_criteria: ' Tests pass ',
        verify_command: ' npm test auth ',
        fallback_plan: 'retry',
      },
      {
        content: 'Deploy',
        success_criteria: '   ',
        fallback_plan: 'invalid',
      },
    ])
    expect(todos[0]).toMatchObject({
      content: 'Add auth',
      success_criteria: 'Tests pass',
      verify_command: 'npm test auth',
      fallback_plan: 'retry',
    })
    expect(todos[1]).toEqual({
      id: 't2',
      content: 'Deploy',
      status: 'pending',
    })
  })
})

describe('seedTodoListFromTitles', () => {
  it('builds an all-pending list from titles', () => {
    const list = seedTodoListFromTitles(['Explore', '', 'Edit', 'Verify'], NOW)
    expect(list.todos.map((t) => t.content)).toEqual(['Explore', 'Edit', 'Verify'])
    expect(list.todos.every((t) => t.status === 'pending')).toBe(true)
    expect(list.updatedAt).toBe(NOW)
  })
})

describe('replaceTodos', () => {
  it('replaces the whole list with full-replace semantics', () => {
    const list = replaceTodos(
      [
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'in_progress' },
        { content: 'c', status: 'pending' },
      ],
      NOW,
    )
    expect(list.todos).toHaveLength(3)
    expect(list.todos[0]).toMatchObject({ id: 't1', content: 'a', status: 'completed' })
    expect(list.todos[1]).toMatchObject({ status: 'in_progress' })
  })
})

describe('parseTodoList', () => {
  it('returns an empty list for junk and coerces valid input', () => {
    expect(parseTodoList(null).todos).toEqual([])
    expect(parseTodoList('nope').todos).toEqual([])
    const parsed = parseTodoList({ todos: [{ content: 'x', status: 'completed' }], updatedAt: NOW })
    expect(parsed.todos[0]).toMatchObject({ id: 't1', content: 'x', status: 'completed' })
    expect(parsed.updatedAt).toBe(NOW)
  })
})

describe('summarizeTodos', () => {
  it('counts by status and computes allDone over non-cancelled', () => {
    const list = replaceTodos([
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'completed' },
      { content: 'c', status: 'cancelled' },
    ])
    const s = summarizeTodos(list)
    expect(s).toMatchObject({ total: 3, completed: 2, cancelled: 1, allDone: true })
  })

  it('allDone is false while work remains', () => {
    const list = replaceTodos([
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'in_progress' },
    ])
    expect(summarizeTodos(list).allDone).toBe(false)
  })

  it('allDone is false for an empty list', () => {
    expect(summarizeTodos(emptyTodoList(NOW)).allDone).toBe(false)
  })
})

describe('mergeExecutionTodoStatuses', () => {
  it('applies a single status update while preserving approved step text', () => {
    const existing = replaceTodos([
      { content: 'Build UI', status: 'pending' },
      { content: 'Add tests', status: 'pending' },
    ], NOW)
    const merged = mergeExecutionTodoStatuses(existing, [
      { content: 'Build UI', status: 'completed' },
      { content: 'Add tests', status: 'pending' },
    ], { now: NOW })
    expect(merged).toMatchObject({
      ok: true,
      list: {
        todos: [
          { content: 'Build UI', status: 'completed' },
          { content: 'Add tests', status: 'pending' },
        ],
      },
    })
  })

  it('rejects new or rewritten step text', () => {
    const existing = replaceTodos([
      { content: 'Build UI', status: 'pending' },
    ], NOW)
    const merged = mergeExecutionTodoStatuses(existing, [
      { content: 'Totally different task', status: 'in_progress' },
    ], { now: NOW })
    expect(merged.ok).toBe(false)
    if (!merged.ok) {
      expect(merged.error).toContain('cannot add or rewrite')
    }
  })

  it('allows partial status updates without dropping other steps', () => {
    const existing = replaceTodos([
      { content: 'One', status: 'pending' },
      { content: 'Two', status: 'pending' },
    ], NOW)
    const merged = mergeExecutionTodoStatuses(existing, [
      { content: 'One', status: 'completed' },
    ], { now: NOW })
    expect(merged).toMatchObject({
      ok: true,
      list: {
        todos: [
          { content: 'One', status: 'completed' },
          { content: 'Two', status: 'pending' },
        ],
      },
    })
  })

  it('rejects changing more than one status in a single call', () => {
    const existing = replaceTodos([
      { content: 'One', status: 'pending' },
      { content: 'Two', status: 'pending' },
    ], NOW)
    const merged = mergeExecutionTodoStatuses(existing, [
      { content: 'One', status: 'completed' },
      { content: 'Two', status: 'in_progress' },
    ], { now: NOW })
    expect(merged.ok).toBe(false)
    if (!merged.ok) {
      expect(merged.error).toContain('at most ONE')
    }
  })

  it('rejects status changes on a step other than the active assigned todo', () => {
    const existing = replaceTodos([
      { content: 'One', status: 'pending' },
      { content: 'Two', status: 'pending' },
    ], NOW)
    const merged = mergeExecutionTodoStatuses(
      existing,
      [{ content: 'Two', status: 'completed' }],
      { now: NOW, activeTodoContent: 'One' },
    )
    expect(merged.ok).toBe(false)
    if (!merged.ok) {
      expect(merged.error).toContain('current assigned step')
      expect(merged.error).toContain('One')
    }
  })

  it('allows status change only on the active assigned todo', () => {
    const existing = replaceTodos([
      { content: 'One', status: 'pending' },
      { content: 'Two', status: 'pending' },
    ], NOW)
    const merged = mergeExecutionTodoStatuses(
      existing,
      [
        { content: 'One', status: 'in_progress' },
        { content: 'Two', status: 'pending' },
      ],
      { now: NOW, activeTodoContent: 'One' },
    )
    expect(merged).toMatchObject({
      ok: true,
      list: {
        todos: [
          { content: 'One', status: 'in_progress' },
          { content: 'Two', status: 'pending' },
        ],
      },
    })
  })
})

describe('todosNamespaceFromScope', () => {
  it('returns "main" for the top-level run (no subRuns segment)', () => {
    expect(todosNamespaceFromScope(undefined)).toBe('main')
    expect(todosNamespaceFromScope('')).toBe('main')
    expect(todosNamespaceFromScope('output/toolLoop/step-1')).toBe('main')
  })

  it('derives a sub-namespace from the deepest subRuns id', () => {
    expect(todosNamespaceFromScope('output/subRuns/abc123')).toBe('sub-abc123')
    expect(
      todosNamespaceFromScope('output/subRuns/abc123/output/toolLoop/step-2'),
    ).toBe('sub-abc123')
    // Nested sub-agents → the deepest (closest) run wins.
    expect(
      todosNamespaceFromScope('output/subRuns/parent9/output/subRuns/child7/x'),
    ).toBe('sub-child7')
  })

  it('sanitizes the id for filesystem safety', () => {
    expect(todosNamespaceFromScope('output/subRuns/a..b/../x')).toBe('sub-ab')
  })
})

describe('todosFileName', () => {
  it('keeps todos.json for main and namespaces sub-runs', () => {
    expect(todosFileName('main')).toBe('todos.json')
    expect(todosFileName('sub-abc123')).toBe('todos.sub-abc123.json')
  })
})

describe('renderTodoChecklist', () => {
  it('renders status marks and verification hints', () => {
    const list = replaceTodos([
      {
        content: 'done',
        status: 'completed',
        success_criteria: 'file exists',
        verify_command: 'test -f out.txt',
      },
      { content: 'now', status: 'in_progress' },
      { content: 'later', status: 'pending' },
      { content: 'nope', status: 'cancelled' },
    ])
    expect(renderTodoChecklist(list)).toBe(
      '- [x] done (verify: file exists) [cmd: test -f out.txt]\n' +
        '- [~] now\n' +
        '- [ ] later\n' +
        '- [-] nope',
    )
  })

  it('handles the empty list', () => {
    expect(renderTodoChecklist(emptyTodoList(NOW))).toBe('_No tasks._')
  })
})
