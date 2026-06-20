import { describe, expect, it } from 'vitest'
import {
  modelRejectsRequiredToolChoice,
  resolveAgentToolChoice,
} from './tool-choice-policy'

describe('tool-choice-policy', () => {
  it('detects DeepSeek V4 and reasoner models', () => {
    expect(modelRejectsRequiredToolChoice('deepseek', 'deepseek-v4-pro')).toBe(true)
    expect(modelRejectsRequiredToolChoice('deepseek', 'deepseek-v4-flash')).toBe(true)
    expect(modelRejectsRequiredToolChoice('deepseek', 'deepseek-reasoner')).toBe(true)
    expect(modelRejectsRequiredToolChoice('openai', 'deepseek-v4-pro')).toBe(true)
  })

  it('allows required tool choice for normal chat models', () => {
    expect(modelRejectsRequiredToolChoice('deepseek', 'deepseek-chat')).toBe(false)
    expect(modelRejectsRequiredToolChoice('openai', 'gpt-4.1')).toBe(false)
  })

  it('downgrades required to auto for thinking-mode models', () => {
    expect(
      resolveAgentToolChoice('required', 'deepseek', 'deepseek-v4-pro'),
    ).toBe('auto')
    expect(resolveAgentToolChoice('auto', 'deepseek', 'deepseek-v4-pro')).toBe(
      'auto',
    )
    expect(resolveAgentToolChoice('none', 'deepseek', 'deepseek-v4-pro')).toBe(
      'none',
    )
  })

  it('preserves required for models that support it', () => {
    expect(resolveAgentToolChoice('required', 'openai', 'gpt-4.1')).toBe(
      'required',
    )
  })
})
