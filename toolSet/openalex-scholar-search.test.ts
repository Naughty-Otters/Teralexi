import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  mapOpenAlexWorkToSearchResult,
  searchOpenAlex,
} from './openalex-scholar-search'

describe('openalex-scholar-search', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'https://openalex.org/W123',
              display_name: 'Attention Is All You Need',
              publication_year: 2017,
              doi: 'https://doi.org/10.48550/arXiv.1706.03762',
              primary_location: {
                landing_page_url: 'https://arxiv.org/abs/1706.03762',
                source: { display_name: 'arXiv' },
              },
              authorships: [{ author: { display_name: 'Ashish Vaswani' } }],
              abstract_inverted_index: {
                The: [0],
                dominant: [1],
                sequence: [2],
              },
            },
          ],
        }),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps OpenAlex works to web search rows', () => {
    const row = mapOpenAlexWorkToSearchResult({
      display_name: 'Sample Paper',
      doi: '10.1234/example',
      publication_year: 2024,
      authorships: [{ author: { display_name: 'Ada Lovelace' } }],
      primary_location: { source: { display_name: 'Nature' } },
    })
    expect(row).toMatchObject({
      title: 'Sample Paper',
      url: 'https://doi.org/10.1234/example',
    })
    expect(row?.snippet).toContain('Ada Lovelace')
  })

  it('searches OpenAlex and returns parsed results', async () => {
    const outcome = await searchOpenAlex('transformers', 5)
    expect(outcome.results).toHaveLength(1)
    expect(outcome.results[0]?.title).toBe('Attention Is All You Need')
    expect(outcome.results[0]?.url).toContain('arxiv.org')
    expect(outcome.results[0]?.snippet).toContain('dominant sequence')
  })
})
