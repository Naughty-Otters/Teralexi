import { describe, expect, it } from 'vitest'
import { deduplicateAndCapSearchResults } from './deduplicate-results'

describe('deduplicateAndCapSearchResults', () => {
  it('deduplicates equivalent urls and applies cap with stable order', () => {
    const items = [
      {
        address: 'https://example.com/page?utm_source=a',
        brief: 'A',
      },
      {
        address: 'https://example.com/page',
        brief: 'B',
      },
      {
        address: 'https://example.com/next',
        brief: 'C',
      },
      {
        address: 'https://example.com/final',
        brief: 'D',
      },
    ]

    const deduped = deduplicateAndCapSearchResults(items, 2)

    expect(deduped).toEqual([
      {
        address: 'https://example.com/page?utm_source=a',
        brief: 'A',
      },
      {
        address: 'https://example.com/next',
        brief: 'C',
      },
    ])
  })
})
