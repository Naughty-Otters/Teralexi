import { describe, expect, it, vi, beforeEach } from 'vitest'
import { expandSearchTopics } from './expand-search-topic'

vi.mock('../../expr/run-expression-llm', () => ({
  runExpressionLlmText: vi.fn(),
}))

import { runExpressionLlmText } from '../../expr/run-expression-llm'

describe('expandSearchTopics', () => {
  beforeEach(() => {
    vi.mocked(runExpressionLlmText).mockReset()
  })

  it('returns topic unchanged when expansion count is 1', async () => {
    const queries = await expandSearchTopics({ currentMessages: [] } as never, {
      topic: 'otter conservation',
      maxResults: 8,
      queryExpansionCount: 1,
      perQueryMaxResults: 8,
      totalResultCap: 8,
    })

    expect(queries).toEqual(['otter conservation'])
    expect(runExpressionLlmText).not.toHaveBeenCalled()
  })

  it('parses JSON array response and keeps topic-first uniqueness', async () => {
    vi.mocked(runExpressionLlmText).mockResolvedValue(
      '["otter conservation", "otter habitat threats", "otter population trends"]',
    )

    const queries = await expandSearchTopics({ currentMessages: [] } as never, {
      topic: 'otter conservation',
      maxResults: 8,
      queryExpansionCount: 2,
      perQueryMaxResults: 8,
      totalResultCap: 12,
    })

    expect(queries).toEqual(['otter conservation', 'otter habitat threats'])
  })

  it('falls back to original topic on expansion failure', async () => {
    vi.mocked(runExpressionLlmText).mockRejectedValue(new Error('llm down'))

    const queries = await expandSearchTopics({ currentMessages: [] } as never, {
      topic: 'otter conservation',
      maxResults: 8,
      queryExpansionCount: 3,
      perQueryMaxResults: 8,
      totalResultCap: 12,
    })

    expect(queries).toEqual(['otter conservation'])
  })
})
