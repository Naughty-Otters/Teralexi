import { beforeEach, describe, expect, it, vi } from 'vitest'

const searchGoogleScholarMock = vi.fn()

vi.mock('@toolSet/google-scholar-search', () => ({
  searchGoogleScholar: (...args: unknown[]) => searchGoogleScholarMock(...args),
}))

import {
  DEEP_RESEARCH_ENGINE_LABEL,
  runDeepResearch,
  runDeepResearchFromConfig,
} from './run-deep-research'

describe('runDeepResearch', () => {
  beforeEach(() => {
    searchGoogleScholarMock.mockReset()
  })

  it('maps scholar results into search items', async () => {
    searchGoogleScholarMock.mockResolvedValue({
      results: [
        {
          url: 'https://scholar.example/paper',
          title: 'Paper Title',
          snippet: '  Abstract snippet  ',
        },
      ],
      searchUrl: 'https://scholar.google.com/search?q=test',
      scopeLabel: 'US courts',
    })

    const result = await runDeepResearch('quantum', 5, 'us')

    expect(searchGoogleScholarMock).toHaveBeenCalledWith('quantum', 5, 'us')
    expect(result).toEqual({
      items: [
        {
          address: 'https://scholar.example/paper',
          brief: 'Abstract snippet',
          title: 'Paper Title',
        },
      ],
      searchEngine: DEEP_RESEARCH_ENGINE_LABEL,
      searchUrl: 'https://scholar.google.com/search?q=test',
    })
  })

  it('falls back to title when snippet is empty', async () => {
    searchGoogleScholarMock.mockResolvedValue({
      results: [{ url: 'https://x', title: 'Only Title', snippet: '   ' }],
      searchUrl: 'https://scholar.google.com/search?q=x',
      scopeLabel: 'all',
    })

    const result = await runDeepResearch('x', 1, 'all')
    expect(result.items[0]?.brief).toBe('Only Title')
  })

  it('returns empty result with scholar error when no hits', async () => {
    searchGoogleScholarMock.mockResolvedValue({
      results: [],
      error: 'Rate limited',
      searchUrl: 'https://scholar.google.com/search?q=nope',
      scopeLabel: 'US',
    })

    const result = await runDeepResearch('nope', 3, 'us')
    expect(result.items).toEqual([])
    expect(result.error).toBe('Rate limited')
  })

  it('returns empty result with default message when no hits and no error', async () => {
    searchGoogleScholarMock.mockResolvedValue({
      results: [],
      searchUrl: 'https://scholar.google.com/search?q=empty',
      scopeLabel: 'US courts',
    })

    const result = await runDeepResearch('empty', 2, 'us')
    expect(result.error).toContain('No Google Scholar results')
    expect(result.error).toContain('empty')
  })

  it('surfaces thrown errors as emptyWebSearchResult', async () => {
    searchGoogleScholarMock.mockRejectedValue(new Error('network down'))

    const result = await runDeepResearch('fail', 1, 'all')
    expect(result.items).toEqual([])
    expect(result.error).toBe('network down')
  })
})

describe('runDeepResearchFromConfig', () => {
  beforeEach(() => {
    searchGoogleScholarMock.mockReset()
    searchGoogleScholarMock.mockResolvedValue({
      results: [],
      searchUrl: 'https://scholar.google.com/search?q=cfg',
      scopeLabel: 'all',
    })
  })

  it('delegates topic and maxResults from config', async () => {
    await runDeepResearchFromConfig(
      { topic: 'climate policy', maxResults: 7, engines: [] },
      'us',
    )
    expect(searchGoogleScholarMock).toHaveBeenCalledWith('climate policy', 7, 'us')
  })
})
