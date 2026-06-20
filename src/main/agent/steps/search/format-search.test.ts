import { describe, expect, it } from 'vitest'
import {
  formatSearchItemsForPrompt,
  formatSearchOutputMarkdown,
} from './format-search'

describe('formatSearchOutputMarkdown', () => {
  it('renders items with address, brief, and total abstraction', () => {
    const markdown = formatSearchOutputMarkdown({
      topic: 'otters',
      items: [
        {
          address: 'https://example.com/a',
          brief: 'River otters are playful.',
          title: 'River otters',
        },
      ],
      abstraction: 'Otters are semiaquatic mammals known for play.',
      searchEngine: 'duckduckgo',
      searchUrl: 'https://duckduckgo.com/?q=otters',
    })

    expect(markdown).toContain('# Search: otters')
    expect(markdown).toContain('Address: https://example.com/a')
    expect(markdown).toContain('Brief: River otters are playful.')
    expect(markdown).toContain('- Total abstraction')
    expect(markdown).toContain('semiaquatic mammals')
  })
})

describe('formatSearchItemsForPrompt', () => {
  it('formats hits for the abstraction LLM', () => {
    const text = formatSearchItemsForPrompt([
      { address: 'https://a.test', brief: 'First hit' },
    ])
    expect(text).toContain('Address: https://a.test')
    expect(text).toContain('Brief: First hit')
  })
})
