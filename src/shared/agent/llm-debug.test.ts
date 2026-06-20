import { describe, expect, it } from 'vitest'
import {
  llmDebugModeToString,
  parseLlmDebugMode,
} from './llm-debug'

describe('llm-debug', () => {
  it('parses truthy values', () => {
    expect(parseLlmDebugMode('true')).toBe(true)
    expect(parseLlmDebugMode('1')).toBe(true)
    expect(parseLlmDebugMode('yes')).toBe(true)
  })

  it('parses falsy values', () => {
    expect(parseLlmDebugMode('false')).toBe(false)
    expect(parseLlmDebugMode('')).toBe(false)
    expect(parseLlmDebugMode(undefined)).toBe(false)
  })

  it('serializes mode', () => {
    expect(llmDebugModeToString(true)).toBe('true')
    expect(llmDebugModeToString(false)).toBe('false')
  })
})
