import { describe, expect, it, vi, beforeEach } from 'vitest'

const runSearchCrawlLoop = vi.hoisted(() => vi.fn())

vi.mock('./search-crawl-loop', () => ({
  runSearchCrawlLoop,
}))

import { cascadeWebSearch } from './web'

describe('cascadeWebSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the first engine with parsed results', async () => {
    runSearchCrawlLoop
      .mockResolvedValueOnce({ results: [], error: 'no results' })
      .mockResolvedValueOnce({
        results: [{ title: 'Hit', url: 'https://example.com', snippet: 'ok' }],
      })

    const outcome = await cascadeWebSearch('test', 5, ['duckduckgo', 'bing'])

    expect(outcome).toMatchObject({
      success: true,
      engine: 'bing',
      resultCount: 1,
      attempts: [
        expect.objectContaining({ engine: 'duckduckgo', success: false }),
        expect.objectContaining({ engine: 'bing', success: true }),
      ],
    })
  })

  it('returns failure when all engines fail', async () => {
    runSearchCrawlLoop.mockResolvedValue({
      results: [],
      error: 'blocked',
    })

    const outcome = await cascadeWebSearch('test', 3, ['duckduckgo', 'bing'])

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error).toContain('All search engines failed')
      expect(outcome.attempts).toHaveLength(2)
    }
  })
})
