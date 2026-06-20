import * as cheerio from 'cheerio'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  cascadeWebSearch,
  decodeDuckDuckGoResultUrl,
  decodeGoogleResultUrl,
  extractPageContent,
  extractPageText,
  isScrapeHtmlInsufficient,
  parseBingHtmlResults,
  parseDuckDuckGoHtmlResults,
  parseGoogleHtmlResults,
  resolveSearchEngineOrder,
  searchWithEngine,
  searchWithEngineMode,
  isJsShellHtml,
  scrapePage,
  webScrape,
  webSearch,
} from './web'

const ddgSampleHtml = `
<html><body>
  <div class="result results_links web-result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example title</a>
    <a class="result__snippet">A short snippet about the page.</a>
  </div>
  <div class="result results_links web-result">
    <a class="result__a" href="https://other.test/doc">Other title</a>
    <a class="result__snippet">Second snippet.</a>
  </div>
</body></html>
`

const bingSampleHtml = `
<ol id="b_results">
  <li class="b_algo">
    <h2><a href="https://example.com/bing">Bing result</a></h2>
    <div class="b_caption"><p>Bing snippet text.</p></div>
  </li>
</ol>
`

const googleSampleHtml = `
<html><body><div id="search">
  <div class="g">
    <a href="/url?q=https%3A%2F%2Fexample.com%2Fgoogle&amp;sa=X"><h3>Google result</h3></a>
    <div class="VwiC3b">Google snippet text.</div>
  </div>
</body></html>
`

async function mockPlaywrightBrowser(
  htmlForUrl: (url: string) => string,
): Promise<void> {
  const { chromium } = await import('playwright-core')
  vi.spyOn(chromium, 'launch').mockResolvedValue({
    newPage: async () => {
      let currentUrl = ''
      const request = {
        post: async (url: string) => ({
          text: async () => htmlForUrl(url),
          url: () => url,
        }),
      }
      return {
        setDefaultTimeout: () => undefined,
        context: () => ({ request }),
        goto: async (url: string) => {
          currentUrl = url
        },
        locator: () => ({
          count: async () => 0,
          first: () => ({ click: async () => undefined }),
        }),
        waitForSelector: async () => undefined,
        content: async () => htmlForUrl(currentUrl || 'https://example.com'),
        url: () => currentUrl || 'https://example.com',
      }
    },
    close: async () => undefined,
  } as Awaited<ReturnType<typeof chromium.launch>>)
}

async function mockSearchHandlers(
  htmlForUrl: (url: string) => string,
): Promise<void> {
  await mockPlaywrightBrowser(htmlForUrl)

  const { CheerioCrawler } = await import('crawlee')
  vi.spyOn(CheerioCrawler.prototype, 'run').mockImplementation(
    async function run(
      this: CheerioCrawler,
      requests: Array<string | { url: string }>,
    ) {
      const handler = (this as unknown as { requestHandler: Function })
        .requestHandler
      const first = requests[0]
      const pageUrl = typeof first === 'string' ? first : (first?.url ?? '')
      await handler({
        $: cheerio.load(htmlForUrl(pageUrl)),
        request: { url: pageUrl, loadedUrl: pageUrl },
      })
    },
  )
}

describe('decodeDuckDuckGoResultUrl', () => {
  it('decodes duckduckgo redirect links', () => {
    expect(
      decodeDuckDuckGoResultUrl(
        '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage',
      ),
    ).toBe('https://example.com/page')
  })

  it('returns direct https links unchanged', () => {
    expect(decodeDuckDuckGoResultUrl('https://other.test/doc')).toBe(
      'https://other.test/doc',
    )
  })
})

describe('decodeGoogleResultUrl', () => {
  it('decodes google /url?q= redirect links', () => {
    expect(
      decodeGoogleResultUrl(
        '/url?q=https%3A%2F%2Fexample.com%2Fgoogle&sa=X',
      ),
    ).toBe('https://example.com/google')
  })
})

describe('parseDuckDuckGoHtmlResults', () => {
  it('parses result rows with title, url, and snippet', () => {
    const $ = cheerio.load(ddgSampleHtml)
    const results = parseDuckDuckGoHtmlResults($, 10)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Example title',
      url: 'https://example.com/page',
      snippet: 'A short snippet about the page.',
    })
    expect(results[1]?.url).toBe('https://other.test/doc')
  })

  it('respects maxResults', () => {
    const $ = cheerio.load(ddgSampleHtml)
    expect(parseDuckDuckGoHtmlResults($, 1)).toHaveLength(1)
  })
})

describe('parseBingHtmlResults', () => {
  it('parses b_algo rows', () => {
    const $ = cheerio.load(bingSampleHtml)
    const results = parseBingHtmlResults($, 5)
    expect(results).toEqual([
      {
        title: 'Bing result',
        url: 'https://example.com/bing',
        snippet: 'Bing snippet text.',
      },
    ])
  })
})

describe('parseGoogleHtmlResults', () => {
  it('parses div.g rows and decodes urls', () => {
    const $ = cheerio.load(googleSampleHtml)
    const results = parseGoogleHtmlResults($, 5)
    expect(results).toEqual([
      {
        title: 'Google result',
        url: 'https://example.com/google',
        snippet: 'Google snippet text.',
      },
    ])
  })
})

describe('resolveSearchEngineOrder', () => {
  it('defaults to duckduckgo → bing → google → yandex → startpage', () => {
    expect(resolveSearchEngineOrder()).toEqual([
      'duckduckgo',
      'bing',
      'google',
      'yandex',
      'startpage',
    ])
  })

  it('deduplicates custom order', () => {
    expect(
      resolveSearchEngineOrder(['google', 'google', 'bing']),
    ).toEqual(['google', 'bing'])
  })
})

describe('extractPageContent', () => {
  it('returns full document HTML with structure preserved', () => {
    const $ = cheerio.load(`
      <html><head><title>Page</title></head><body>
        <article>
          <h1 id="title">Hello</h1>
          <p>Intro <a href="/docs">docs</a></p>
          <ul><li>One</li><li>Two</li></ul>
        </article>
      </body></html>
    `)
    const { html } = extractPageContent($)
    expect(html).toMatch(/^<html[\s>]/i)
    expect(html).toContain('<h1')
    expect(html).toContain('Hello')
    expect(html).toContain('href="/docs"')
    expect(html).toContain('<li>One</li>')
    expect(html).not.toContain('<script')
  })

  it('includes full document content, not only a main region', () => {
    const $ = cheerio.load(`
      <html><body>
        <nav>Nav link</nav>
        <main><p>Main copy</p></main>
        <footer>Footer note</footer>
      </body></html>
    `)
    const { html } = extractPageContent($)
    expect(html).toContain('Nav link')
    expect(html).toContain('Main copy')
    expect(html).toContain('Footer note')
  })

  it('strips script tags from returned HTML', () => {
    const $ = cheerio.load(
      '<html><body><script>alert(1)</script><p>Visible</p></body></html>',
    )
    const { html } = extractPageContent($)
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('Visible')
  })
})

describe('extractPageText', () => {
  it('strips scripts and collapses whitespace', () => {
    const $ = cheerio.load(`
      <html><head><title>  Hello   </title></head>
      <body><script>ignore()</script><p>Line one</p><p>Line two</p></body></html>
    `)
    const { title, text, truncated } = extractPageText($, { maxChars: 10_000 })
    expect(title).toBe('Hello')
    expect(text).toContain('Line one')
    expect(text).not.toContain('ignore')
    expect(truncated).toBe(false)
  })

  it('truncates long text', () => {
    const $ = cheerio.load('<html><body>abcdefghij</body></html>')
    const { text, truncated } = extractPageText($, { maxChars: 5 })
    expect(text).toBe('abcde')
    expect(truncated).toBe(true)
  })
})

describe('cascadeWebSearch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('falls through to bing when duckduckgo returns no results', async () => {
    await mockSearchHandlers((url) =>
      url.includes('bing.com') ? bingSampleHtml : '<html><body></body></html>',
    )

    const outcome = await cascadeWebSearch('test', 5, ['duckduckgo', 'bing'])
    expect(outcome.success).toBe(true)
    if (outcome.success) {
      expect(outcome.engine).toBe('bing')
      expect(outcome.attempts).toHaveLength(2)
      expect(outcome.attempts[0]?.success).toBe(false)
      expect(outcome.attempts[1]?.success).toBe(true)
    }
  })
})

describe('webSearch tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns validation error for empty query', async () => {
    const result = await webSearch.execute({ query: '' })
    expect(result).toMatchObject({ success: false })
  })

  it('returns parsed results from first successful engine', async () => {
    await mockSearchHandlers(() => ddgSampleHtml)

    const result = await webSearch.execute({ query: 'test', maxResults: 5 })
    expect(result).toMatchObject({
      success: true,
      query: 'test',
      engine: 'duckduckgo',
      resultCount: 2,
      attempts: expect.arrayContaining([
        expect.objectContaining({ engine: 'duckduckgo', success: true }),
      ]),
    })
  })
})

const engineIds = [
  'duckduckgo',
  'bing',
  'google',
  'yandex',
  'startpage',
] as const
const crawlModes = ['cheerio', 'playwright'] as const

const engineSampleHtml: Record<(typeof engineIds)[number], string> = {
  duckduckgo: ddgSampleHtml,
  bing: bingSampleHtml,
  google: googleSampleHtml,
  yandex: `
    <ul>
      <li class="serp-item">
        <a class="OrganicTitle-Link" href="https://example.com/yandex">Yandex result</a>
        <div class="OrganicText">Yandex snippet.</div>
      </li>
    </ul>
  `,
  startpage: `
    <div class="result">
      <h2>Startpage result</h2>
      <a href="https://example.com/startpage">link</a>
      <p>A long enough snippet for the Startpage parser.</p>
    </div>
  `,
}

describe('searchWithEngineMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  for (const engineId of engineIds) {
    for (const mode of crawlModes) {
      it(`parses ${engineId} via ${mode}`, async () => {
        await mockSearchHandlers((url) => {
          if (
            engineId === 'google' &&
            mode === 'cheerio' &&
            url.includes('google.com')
          ) {
            return '<html><body>enablejs</body></html>'
          }
          return engineSampleHtml[engineId]
        })

        const result = await searchWithEngineMode(
          engineId,
          'test query',
          5,
          mode,
        )
        expect(result.mode).toBe(mode)
        if (engineId === 'google' && mode === 'cheerio') {
          expect(result.results).toHaveLength(0)
          return
        }
        expect(result.results.length).toBeGreaterThan(0)
        expect(result.results[0]?.title).toBeTruthy()
        expect(result.results[0]?.url).toMatch(/^https?:\/\//)
      })
    }
  }
})

describe('searchWithEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses Startpage fallback when Google playwright crawl is blocked', async () => {
    await mockSearchHandlers((url) => {
      if (url.includes('startpage.com')) {
        return `
          <div class="result">
            <h2>Earth mass - Wikipedia</h2>
            <a href="https://en.wikipedia.org/wiki/Earth_mass">link</a>
            <p>Mass estimate snippet text here for parsing.</p>
          </div>
        `
      }
      return '<html><body>enablejs httpservice/retry/enablejs</body></html>'
    })

    const result = await searchWithEngine('google', 'earth mass', 5)
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]?.url).toContain('wikipedia.org')
  })

  it('reports error when parser finds no rows', async () => {
    await mockSearchHandlers(() => '<html><body></body></html>')

    const result = await searchWithEngine('bing', 'x', 5)
    expect(result.results).toHaveLength(0)
    expect(result.error).toMatch(/No bing results/)
  })
})

describe('webScrape tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('requires url or urls', async () => {
    const result = await webScrape.execute({})
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('url'),
    })
  })

  it('scrapes a page via crawler', async () => {
    const { CheerioCrawler } = await import('crawlee')
    vi.spyOn(CheerioCrawler.prototype, 'run').mockImplementation(
      async function run(this: CheerioCrawler, urls: string[]) {
        const handler = (this as unknown as { requestHandler: Function })
          .requestHandler
        for (const pageUrl of urls) {
          await handler({
            $: cheerio.load(
              '<html><title>Page</title><body><p>' +
                'Body text with enough characters to pass the minimum scrape length threshold. '.repeat(2) +
                '</p></body></html>',
            ),
            request: { url: pageUrl, loadedUrl: pageUrl },
          })
        }
      },
    )

    const result = await webScrape.execute({
      url: 'https://example.com',
    })
    expect(result).toMatchObject({
      success: true,
      pageCount: 1,
      pages: [
        expect.objectContaining({
          url: 'https://example.com',
          title: 'Page',
          html: expect.stringContaining('Body text'),
          fetchMode: 'cheerio',
        }),
      ],
    })
  })

  it('falls back to Playwright when Cheerio returns a JS shell', async () => {
    const { CheerioCrawler } = await import('crawlee')
    vi.spyOn(CheerioCrawler.prototype, 'run').mockImplementation(
      async function run(this: CheerioCrawler, urls: string[]) {
        const handler = (this as unknown as { requestHandler: Function })
          .requestHandler
        for (const pageUrl of urls) {
          await handler({
            $: cheerio.load(
              '<html><body>enablejs httpservice/retry/enablejs</body></html>',
            ),
            request: { url: pageUrl, loadedUrl: pageUrl },
          })
        }
      },
    )
    await mockPlaywrightBrowser(() =>
      '<html><title>Rendered</title><body><p>' +
        'Playwright body text with enough characters to pass the minimum scrape length threshold. '.repeat(2) +
        '</p></body></html>',
    )

    const result = await webScrape.execute({ url: 'https://example.com/js-page' })
    expect(result).toMatchObject({
      success: true,
      pages: [
        expect.objectContaining({
          fetchMode: 'playwright',
          title: 'Rendered',
          html: expect.stringContaining('Playwright body'),
        }),
      ],
    })
  })
})

describe('scrape helpers', () => {
  it('detects JS shell HTML', () => {
    expect(isJsShellHtml('<body>enablejs retry</body>')).toBe(true)
    expect(isJsShellHtml('<body>Hello world</body>')).toBe(false)
  })

  it('detects insufficient scrape HTML', () => {
    expect(isScrapeHtmlInsufficient('<html><body>short</body></html>')).toBe(
      true,
    )
    expect(
      isScrapeHtmlInsufficient(
        `<html><body>${'x'.repeat(100)}</body></html>`,
      ),
    ).toBe(false)
  })
})
