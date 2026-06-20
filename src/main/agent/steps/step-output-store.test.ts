import { describe, expect, it } from 'vitest'
import { StepOutputStore } from './step-output-store'
import type { StepOutputEntry, ThinkingStepData, PlanningStepData, TextStepData } from './step-io'

describe('StepOutputStore', () => {
  it('push and latest retrieves the last entry for a step', () => {
    const store = new StepOutputStore()
    const entry: StepOutputEntry<ThinkingStepData> = {
      stepId: 'thinking',
      instanceKey: 'thinking:1',
      data: { raw: 'digest 1', rendered: '**Thinking**\n\ndigest 1' },
      timestamp: '2026-01-01T00:00:00Z',
    }
    store.push(entry)
    expect(store.latest<ThinkingStepData>('thinking')).toEqual(entry.data)
  })

  it('latest returns the most recent entry when multiple are pushed', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: 'toolLoop',
      instanceKey: 'tl:1',
      data: { text: 'first', rendered: 'first' } as TextStepData,
      timestamp: '2026-01-01T00:00:00Z',
    })
    store.push({
      stepId: 'toolLoop',
      instanceKey: 'tl:2',
      data: { text: 'second', rendered: 'second' } as TextStepData,
      timestamp: '2026-01-01T00:01:00Z',
    })
    expect(store.latest<TextStepData>('toolLoop')?.text).toBe('second')
  })

  it('all returns all entries for a step', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: 'toolLoop',
      instanceKey: 'tl:1',
      data: { text: 'a' } as TextStepData,
      timestamp: '2026-01-01T00:00:00Z',
    })
    store.push({
      stepId: 'toolLoop',
      instanceKey: 'tl:2',
      data: { text: 'b' } as TextStepData,
      timestamp: '2026-01-01T00:01:00Z',
    })
    expect(store.all('toolLoop')).toHaveLength(2)
  })

  it('has returns false for missing step', () => {
    const store = new StepOutputStore()
    expect(store.has('planning')).toBe(false)
  })

  it('has returns true after push', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: 'planning',
      instanceKey: 'p:1',
      data: { finalGoal: 'goal', todoList: [] } as unknown as PlanningStepData,
      timestamp: '2026-01-01T00:00:00Z',
    })
    expect(store.has('planning')).toBe(true)
  })

  it('clear removes all entries', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: 'thinking',
      instanceKey: 'th:1',
      data: { raw: 'x' } as ThinkingStepData,
      timestamp: '2026-01-01T00:00:00Z',
    })
    store.clear()
    expect(store.has('thinking')).toBe(false)
    expect(store.latest('thinking')).toBeUndefined()
  })

  it('clone produces an independent copy', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: 'thinking',
      instanceKey: 'th:1',
      data: { raw: 'original' } as ThinkingStepData,
      timestamp: '2026-01-01T00:00:00Z',
    })
    const copy = store.clone()
    store.push({
      stepId: 'thinking',
      instanceKey: 'th:2',
      data: { raw: 'added' } as ThinkingStepData,
      timestamp: '2026-01-01T00:01:00Z',
    })
    expect(store.all('thinking')).toHaveLength(2)
    expect(copy.all('thinking')).toHaveLength(1)
  })

  it('toJSON and fromJSON round-trip', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: 'planning',
      instanceKey: 'p:1',
      data: { finalGoal: 'g', todoList: [{ id: 1 }], rendered: 'plan' } as unknown as PlanningStepData,
      timestamp: '2026-01-01T00:00:00Z',
    })
    store.push({
      stepId: 'toolLoop',
      instanceKey: 'tl:1',
      data: { text: 'tool output' } as TextStepData,
      timestamp: '2026-01-01T00:01:00Z',
    })

    const json = store.toJSON()
    const restored = StepOutputStore.fromJSON(json)

    expect(restored.has('planning')).toBe(true)
    expect(restored.has('toolLoop')).toBe(true)
    expect(restored.latest<PlanningStepData>('planning')?.finalGoal).toBe('g')
    expect(restored.latest<TextStepData>('toolLoop')?.text).toBe('tool output')
  })

  it('keys returns all step ids with entries', () => {
    const store = new StepOutputStore()
    store.push({
      stepId: 'thinking',
      instanceKey: 'th:1',
      data: { raw: 'x' } as ThinkingStepData,
      timestamp: '2026-01-01T00:00:00Z',
    })
    store.push({
      stepId: 'summary',
      instanceKey: 's:1',
      data: { summary: 'y' } as unknown,
      timestamp: '2026-01-01T00:00:00Z',
    } as StepOutputEntry)
    expect(store.keys().sort()).toEqual(['summary', 'thinking'])
  })

  it('latest returns undefined for empty store', () => {
    const store = new StepOutputStore()
    expect(store.latest('thinking')).toBeUndefined()
  })

  it('all returns empty array for missing step', () => {
    const store = new StepOutputStore()
    expect(store.all('planning')).toEqual([])
  })
})
