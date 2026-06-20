import { describe, expect, it, vi, beforeEach } from 'vitest'
import { deepResearch } from './deep-research'

vi.mock('./google-scholar-search', () => ({
  searchGoogleScholar: vi.fn(),
}))

import { searchGoogleScholar } from './google-scholar-search'

describe('deepResearch tool', () => {
  beforeEach(() => {
    vi.mocked(searchGoogleScholar).mockReset()
  })

  it('lists scholar filter options', async () => {
    const result = await deepResearch.execute({ listOptions: true })
    expect(result).toMatchObject({ success: true, listOnly: true })
    if (!result.success || !('federalCourts' in result)) return
    expect(result.federalCourts.length).toBeGreaterThan(5)
    expect(result.states.length).toBe(51)
    expect(result.categories).toContain('article')
    expect(result.categories).toContain('case_law_federal')
    expect(searchGoogleScholar).not.toHaveBeenCalled()
  })

  it('rejects empty query', async () => {
    const result = await deepResearch.execute({ query: '' })
    expect(result.success).toBe(false)
  })

  it('returns scholar results on success', async () => {
    vi.mocked(searchGoogleScholar).mockResolvedValue({
      results: [
        {
          title: 'Paper A',
          url: 'https://example.com/a',
          snippet: 'snippet',
        },
      ],
      searchUrl: 'https://scholar.google.com/scholar?q=test',
      scopeLabel: 'scholarly articles',
    })

    const result = await deepResearch.execute({
      query: 'neural nets',
      category: 'article',
      maxResults: 3,
    })

    expect(result).toMatchObject({
      success: true,
      query: 'neural nets',
      category: 'article',
      resultCount: 1,
    })
    expect(searchGoogleScholar).toHaveBeenCalledWith(
      'neural nets',
      3,
      expect.objectContaining({ category: 'article' }),
    )
  })

  it('returns failure when scholar has no results', async () => {
    vi.mocked(searchGoogleScholar).mockResolvedValue({
      results: [],
      searchUrl: 'https://scholar.google.com/scholar?q=empty',
      scopeLabel: 'scholarly articles',
      error: 'blocked',
    })

    const result = await deepResearch.execute({
      query: 'empty query',
      category: 'article',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('blocked')
    expect(result.availableFilters).toBeDefined()
  })

  it('uses default message when scholar returns empty without error', async () => {
    vi.mocked(searchGoogleScholar).mockResolvedValue({
      results: [],
      searchUrl: 'https://scholar.google.com/scholar?q=empty',
      scopeLabel: 'scholarly articles',
    })

    const result = await deepResearch.execute({
      query: 'empty query',
      category: 'article',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('No Google Scholar results')
  })

  it('returns failure when searchGoogleScholar throws', async () => {
    vi.mocked(searchGoogleScholar).mockRejectedValue(new Error('crawler boom'))

    const result = await deepResearch.execute({
      query: 'fail',
      category: 'case_law',
      state: 'NY',
    })

    expect(result).toMatchObject({
      success: false,
      error: 'crawler boom',
      query: 'fail',
      category: 'case_law',
    })
  })

  it('rejects invalid input schema', async () => {
    const result = await deepResearch.execute({
      query: 'x',
      category: 'not-a-category',
    })
    expect(result.success).toBe(false)
  })
})
