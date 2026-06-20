import { describe, expect, it } from 'vitest'
import {
  STEP_WHEN_HARNESS_PRESETS,
  resolveWhenHarnessCondition,
} from './when-harness-presets'
import type { AgentFlowContext } from '../context'
import type { StepExpressionHarnessContext } from './expression-plan'

const dummyCtx = {} as AgentFlowContext

describe('STEP_WHEN_HARNESS_PRESETS', () => {
  it('nonEmpty returns true for non-empty text', () => {
    const harness = { text: 'hello' } as StepExpressionHarnessContext
    expect(STEP_WHEN_HARNESS_PRESETS.nonEmpty(dummyCtx, harness)).toBe(true)
  })

  it('nonEmpty returns false for whitespace-only text', () => {
    const harness = { text: '   ' } as StepExpressionHarnessContext
    expect(STEP_WHEN_HARNESS_PRESETS.nonEmpty(dummyCtx, harness)).toBe(false)
  })

  it('nonEmpty returns false for empty text', () => {
    const harness = { text: '' } as StepExpressionHarnessContext
    expect(STEP_WHEN_HARNESS_PRESETS.nonEmpty(dummyCtx, harness)).toBe(false)
  })

  it('hasJson returns true for valid JSON', () => {
    const harness = { text: '{"key": "value"}' } as StepExpressionHarnessContext
    expect(STEP_WHEN_HARNESS_PRESETS.hasJson(dummyCtx, harness)).toBe(true)
  })

  it('hasJson returns true for JSON array', () => {
    const harness = { text: '[1, 2, 3]' } as StepExpressionHarnessContext
    expect(STEP_WHEN_HARNESS_PRESETS.hasJson(dummyCtx, harness)).toBe(true)
  })

  it('hasJson returns false for invalid JSON', () => {
    const harness = { text: 'not json at all' } as StepExpressionHarnessContext
    expect(STEP_WHEN_HARNESS_PRESETS.hasJson(dummyCtx, harness)).toBe(false)
  })

  it('hasJson returns false for empty text', () => {
    const harness = { text: '' } as StepExpressionHarnessContext
    expect(STEP_WHEN_HARNESS_PRESETS.hasJson(dummyCtx, harness)).toBe(false)
  })
})

describe('resolveWhenHarnessCondition', () => {
  it('returns function as-is when given a function', () => {
    const fn = () => true
    expect(resolveWhenHarnessCondition(fn)).toBe(fn)
  })

  it('resolves known preset name', () => {
    const resolved = resolveWhenHarnessCondition('nonEmpty')
    expect(resolved).toBe(STEP_WHEN_HARNESS_PRESETS.nonEmpty)
  })

  it('resolves hasJson preset', () => {
    const resolved = resolveWhenHarnessCondition('hasJson')
    expect(resolved).toBe(STEP_WHEN_HARNESS_PRESETS.hasJson)
  })

  it('throws for unknown preset name', () => {
    expect(() => resolveWhenHarnessCondition('unknownPreset')).toThrow(
      /Unknown when harness preset "unknownPreset"/,
    )
  })
})
