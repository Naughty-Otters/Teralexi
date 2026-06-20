import { describe, expect, it } from 'vitest'
import { buildExpressionLlmCallParams } from './llm-call-params'

describe('buildExpressionLlmCallParams', () => {
  it('maps system_msg to instructions and system', () => {
    const params = buildExpressionLlmCallParams(
      { instructions: 'Model rules', userPrompt: 'Do X' },
      [],
    )
    expect(params.instructions).toBe('Model rules')
    expect(params.system).toBe('Model rules')
    expect(params.messages).toEqual([{ role: 'user', content: 'Do X' }])
  })
})
