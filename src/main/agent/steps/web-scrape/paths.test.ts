import { describe, expect, it } from 'vitest'
import { slugFromUrl, webScrapeOutputPath } from './paths'

describe('webScrape paths', () => {
  it('writes under sandbox/webScrape/output/', () => {
    expect(webScrapeOutputPath('/tmp/sandbox', '001-example-com.md')).toBe(
      '/tmp/sandbox/webScrape/output/001-example-com.md',
    )
  })

  it('builds stable slugs from urls', () => {
    expect(slugFromUrl('https://www.example.com/docs/page', 0)).toBe(
      '001-example.com-docs-page.md',
    )
  })
})
