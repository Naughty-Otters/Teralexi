import { describe, expect, it } from 'vitest'
import {
  buildFimPrompt,
  extractFimContext,
  FIM_MIDDLE,
  FIM_PREFIX,
  FIM_SUFFIX,
  isFimCapableModel,
  OPENAI_COMPATIBLE_API_STOP_TOKENS,
  sanitizeChatInfillCompletion,
  sanitizeFimCompletion,
} from './fim-prompt'

describe('fim-prompt', () => {
  it('builds a DeepSeek-style FIM prompt', () => {
    expect(buildFimPrompt('const x = ', ';')).toBe(
      `${FIM_PREFIX}const x = ${FIM_SUFFIX};${FIM_MIDDLE}`,
    )
  })

  it('extracts prefix and suffix around the cursor', () => {
    const lines = ['line one', 'const value = ', 'line three']
    expect(extractFimContext(lines, 2, 15)).toEqual({
      prefix: 'line one\nconst value = ',
      suffix: '\nline three',
    })
  })

  it('limits context to configured line windows', () => {
    const lines = ['a', 'b', 'c', 'd', 'e']
    expect(
      extractFimContext(lines, 3, 2, {
        maxPrefixLines: 1,
        maxSuffixLines: 2,
      }),
    ).toEqual({
      prefix: 'c',
      suffix: '\nd\ne',
    })
  })

  it('strips stop tokens and suffix overlap from completions', () => {
    expect(
      sanitizeFimCompletion('return true;\n\n', ';\nreturn false;'),
    ).toBe('return true')
    expect(
      sanitizeFimCompletion(`hello${FIM_SUFFIX}world`, ''),
    ).toBe('hello')
  })

  it('limits openai-compatible API stop tokens to four entries', () => {
    expect(OPENAI_COMPATIBLE_API_STOP_TOKENS).toHaveLength(4)
  })

  it('detects FIM-capable coder models', () => {
    expect(isFimCapableModel('deepseek-coder')).toBe(true)
    expect(isFimCapableModel('gpt-4o')).toBe(false)
  })

  it('sanitizes chat infill responses with optional markdown fences', () => {
    expect(sanitizeChatInfillCompletion('```ts\nreturn 1;\n```', '')).toBe('return 1;')
  })
})
