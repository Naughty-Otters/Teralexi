import { describe, expect, it } from 'vitest'
import {
  buildFormSubmitExecutorDirective,
  buildSkillsToolExecutorInstructions,
} from './skills-tool-llm'

describe('buildSkillsToolExecutorInstructions', () => {
  it('assembles step goal, attempt, and optional blocks', () => {
    const out = buildSkillsToolExecutorInstructions({
      stepGoal: 'Run tests',
      attempt: 2,
      maxAttempts: 3,
      lastRetryContext: 'Missing coverage',
      previousStepBlock: 'PREV',
      sandboxBlock: 'SANDBOX',
      referencesContent: 'ref.md',
    })
    expect(out).toContain('Run tests')
    expect(out).toContain('2/3')
    expect(out).toContain('Missing coverage')
    expect(out).toContain('PREV')
    expect(out).toContain('SANDBOX')
    expect(out).toContain('REFERENCE MATERIALS')
  })

  it('does not include form values in system instructions', () => {
    const out = buildSkillsToolExecutorInstructions({
      stepGoal: 'Run tests',
      attempt: 1,
      maxAttempts: 1,
      lastRetryContext: '',
      previousStepBlock: '',
      sandboxBlock: '',
      referencesContent: '',
    })
    expect(out).not.toContain('USER-PROVIDED FORM VALUES')
  })
})

describe('buildFormSubmitExecutorDirective', () => {
  it('uses first-attempt wording on attempt 1', () => {
    expect(buildFormSubmitExecutorDirective('goal', 1, 3, '')).toContain(
      'submitted form values',
    )
  })

  it('includes retry context on later attempts', () => {
    const out = buildFormSubmitExecutorDirective('goal', 2, 3, 'fix fields')
    expect(out).toContain('retry 2/3')
    expect(out).toContain('fix fields')
  })
})
