import { describe, expect, it } from 'vitest'
import { buildParallelTodosPrompt } from './submitChatText'

describe('buildParallelTodosPrompt', () => {
  it('lists pending todos for invoke_agents fan-out', () => {
    const prompt = buildParallelTodosPrompt([
      { id: '1', content: 'Add tests', status: 'pending' },
      { id: '2', content: 'Update docs', status: 'pending' },
    ])
    expect(prompt).toContain('invoke_agents')
    expect(prompt).toContain('1. Add tests')
    expect(prompt).toContain('2. Update docs')
  })
})
