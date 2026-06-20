import { describe, expect, it } from 'vitest'
import { resolveSearchConfig } from './search-config'

describe('resolveSearchConfig', () => {
  it('applies defaults for multi-angle fields', () => {
    const resolved = resolveSearchConfig({ topic: 'otters' }, {
      getLatestUserMessageContent: () => 'fallback',
    } as never)

    expect(resolved).toMatchObject({
      topic: 'otters',
      maxResults: 8,
      queryExpansionCount: 1,
      perQueryMaxResults: 8,
      totalResultCap: 8,
    })
  })

  it('normalizes invalid numeric values to positive integers', () => {
    const resolved = resolveSearchConfig(
      {
        topic: 'otters',
        maxResults: 0,
        queryExpansionCount: -5,
        perQueryMaxResults: Number.NaN,
        totalResultCap: 0,
      },
      { getLatestUserMessageContent: () => 'fallback' } as never,
    )

    expect(resolved).toMatchObject({
      maxResults: 8,
      queryExpansionCount: 1,
      perQueryMaxResults: 8,
      totalResultCap: 8,
    })
  })
})
