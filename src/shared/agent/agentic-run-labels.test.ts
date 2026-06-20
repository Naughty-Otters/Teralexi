import { describe, expect, it } from 'vitest'
import {
  AGENTIC_RUN_STEP_TITLE,
  formatAgenticRunTaskStepTitle,
  isAgenticRunParentStepTitle,
  isAgenticRunPerTaskStepTitle,
} from './agentic-run-labels'

describe('agentic-run-labels', () => {
  it('formats per-task titles', () => {
    expect(formatAgenticRunTaskStepTitle(2, 3)).toBe(
      'Agentic Run Task 2 Attempt 3',
    )
  })

  it('recognizes parent and legacy parent titles', () => {
    expect(isAgenticRunParentStepTitle(AGENTIC_RUN_STEP_TITLE)).toBe(true)
    expect(isAgenticRunParentStepTitle('Tool Loop')).toBe(true)
    expect(isAgenticRunParentStepTitle('Planning')).toBe(false)
  })

  it('treats undefined titles as non-matching', () => {
    expect(isAgenticRunParentStepTitle(undefined)).toBe(false)
    expect(isAgenticRunPerTaskStepTitle(undefined)).toBe(false)
  })

  it('recognizes per-task and legacy per-task titles', () => {
    expect(isAgenticRunPerTaskStepTitle('Agentic Run Task 1 Attempt 2')).toBe(
      true,
    )
    expect(isAgenticRunPerTaskStepTitle('Tool Loop Task 1 Attempt 2')).toBe(
      true,
    )
    expect(isAgenticRunPerTaskStepTitle(AGENTIC_RUN_STEP_TITLE)).toBe(false)
  })
})
