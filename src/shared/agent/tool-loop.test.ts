import { describe, expect, it } from 'vitest'
import {
  clampTodoMaxRetries,
  clampToolLoopMaxIterations,
  DEFAULT_TODO_MAX_RETRIES,
  DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
  MAX_TODO_MAX_RETRIES,
  MAX_TOOL_LOOP_MAX_ITERATIONS,
  MIN_TODO_MAX_RETRIES,
  MIN_TOOL_LOOP_MAX_ITERATIONS,
  resolveTodoMaxRetries,
  resolveToolLoopMaxIterations,
} from '@shared/agent/tool-loop'

describe('clampToolLoopMaxIterations', () => {
  it('returns default for non-finite values', () => {
    expect(clampToolLoopMaxIterations(NaN)).toBe(DEFAULT_TOOL_LOOP_MAX_ITERATIONS)
    expect(clampToolLoopMaxIterations(Infinity)).toBe(DEFAULT_TOOL_LOOP_MAX_ITERATIONS)
  })

  it('floors and clamps to min/max bounds', () => {
    expect(clampToolLoopMaxIterations(0)).toBe(MIN_TOOL_LOOP_MAX_ITERATIONS)
    expect(clampToolLoopMaxIterations(0.9)).toBe(MIN_TOOL_LOOP_MAX_ITERATIONS)
    // Floors a fractional value that sits within the allowed range.
    expect(clampToolLoopMaxIterations(50.7)).toBe(50)
    // Clamps a value above the ceiling.
    expect(clampToolLoopMaxIterations(999)).toBe(MAX_TOOL_LOOP_MAX_ITERATIONS)
  })
})

describe('resolveToolLoopMaxIterations', () => {
  it('uses default when null or undefined', () => {
    expect(resolveToolLoopMaxIterations(undefined)).toBe(
      DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
    )
    expect(resolveToolLoopMaxIterations(null)).toBe(
      DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
    )
  })

  it('clamps finite numbers', () => {
    expect(resolveToolLoopMaxIterations(10)).toBe(10)
    expect(resolveToolLoopMaxIterations(500)).toBe(MAX_TOOL_LOOP_MAX_ITERATIONS)
  })
})

describe('clampTodoMaxRetries', () => {
  it('returns default for non-finite values', () => {
    expect(clampTodoMaxRetries(NaN)).toBe(DEFAULT_TODO_MAX_RETRIES)
  })

  it('clamps to min/max bounds', () => {
    expect(clampTodoMaxRetries(0)).toBe(MIN_TODO_MAX_RETRIES)
    expect(clampTodoMaxRetries(99)).toBe(MAX_TODO_MAX_RETRIES)
    expect(clampTodoMaxRetries(5)).toBe(5)
  })
})

describe('resolveTodoMaxRetries', () => {
  it('uses default when null or undefined', () => {
    expect(resolveTodoMaxRetries(undefined)).toBe(DEFAULT_TODO_MAX_RETRIES)
    expect(resolveTodoMaxRetries(null)).toBe(DEFAULT_TODO_MAX_RETRIES)
  })
})
