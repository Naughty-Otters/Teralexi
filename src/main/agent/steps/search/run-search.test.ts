import { describe, expect, it, vi, beforeEach } from 'vitest'
import { emptyWebSearchResult, runWebSearch } from './run-search'

vi.mock('@toolSet/web', () => ({
  cascadeWebSearch: vi.fn(),
}))

import { cascadeWebSearch } from '@toolSet/web'

describe('runWebSearch', () => {
  beforeEach(() => {
    vi.mocked(cascadeWebSearch).mockReset()
  })

  it('returns empty items when cascadeWebSearch throws', async () => {
    vi.mocked(cascadeWebSearch).mockRejectedValue(new Error('boom'))

    const result = await runWebSearch({
      topic: 'test',
      maxResults: 5,
    })

    expect(result).toEqual(emptyWebSearchResult('boom'))
  })
})
