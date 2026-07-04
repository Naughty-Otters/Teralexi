import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWin } from '@test-paths'
import { slugFromUrl, webScrapeOutputPath } from './paths'

const SANDBOX = isWin ? 'C:\\tmp\\sandbox' : '/tmp/sandbox'

describe('webScrape paths', () => {
  it('writes under sandbox/webScrape/output/', () => {
    expect(webScrapeOutputPath(SANDBOX, '001-example-com.md')).toBe(
      join(SANDBOX, 'webScrape', 'output', '001-example-com.md'),
    )
  })

  it('builds stable slugs from urls', () => {
    expect(slugFromUrl('https://www.example.com/docs/page', 0)).toBe(
      '001-example.com-docs-page.md',
    )
  })
})
