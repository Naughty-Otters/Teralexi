import * as cheerio from 'cheerio'
import { describe, expect, it, vi } from 'vitest'
import {
  SearchCrawlerHandlerRegistry,
  type SearchPagePayload,
} from './search-crawlers'
import {
  decodeScholarResultUrl,
  googleScholarSearchEngine,
  isScholarAccessBlocked,
  parseScholarHtmlResults,
  searchGoogleScholar,
  SEARCH_CRAWLER_USER_AGENT,
} from './google-scholar-search'

const scholarSampleHtml = `
<html><body>
  <div class="gs_r gs_or gs_scl">
    <div class="gs_ri">
      <h3 class="gs_rt"><a href="/scholar?q=info:abc">Deep Learning Survey</a></h3>
      <div class="gs_a">Y LeCun, Y Bengio - Nature, 2015</div>
      <div class="gs_rs">A review of representation learning methods.</div>
    </div>
  </div>
  <div class="gs_r gs_or gs_scl">
    <div class="gs_ri">
      <h3 class="gs_rt"><a href="https://example.com/paper.pdf">Another Paper</a></h3>
      <div class="gs_a">A Author - Journal, 2020</div>
      <div class="gs_rs">Second snippet.</div>
    </div>
  </div>
</body></html>
`

function mockScholarHandlers(
  responses: Partial<Record<'cheerio' | 'playwright', SearchPagePayload | Error>>,
): SearchCrawlerHandlerRegistry {
  const makeHandler = (mode: 'cheerio' | 'playwright') => ({
    mode,
    fetch: vi.fn(async () => {
      const value = responses[mode]
      if (value instanceof Error) throw value
      if (!value) {
        throw new Error(`no mock for ${mode}`)
      }
      return value
    }),
  })

  return new SearchCrawlerHandlerRegistry(
    makeHandler('cheerio') as never,
    makeHandler('playwright') as never,
  )
}

describe('google-scholar-search', () => {
  it('parses scholar result rows', () => {
    const $ = cheerio.load(scholarSampleHtml)
    const results = parseScholarHtmlResults($, 10)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Deep Learning Survey')
    expect(results[0].url).toContain('scholar.google.com')
    expect(results[0].snippet).toContain('Nature')
    expect(results[1].url).toBe('https://example.com/paper.pdf')
  })

  it('respects maxResults and skips invalid rows', () => {
    const html = `
      <div class="gs_ri"><h3 class="gs_rt"><a href="https://a.test">A</a></h3></div>
      <div class="gs_ri"><h3 class="gs_rt"><a href="https://a.test">Dup</a></h3></div>
      <div class="gs_ri"><h3 class="gs_rt"></h3></div>
      <div class="gs_ri"><h3 class="gs_rt"><a href="https://b.test">B</a></h3></div>
    `
    const results = parseScholarHtmlResults(cheerio.load(html), 1)
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://a.test')
  })

  it('decodes relative and protocol-relative scholar links', () => {
    expect(decodeScholarResultUrl('/scholar?q=info:xyz')).toContain(
      'scholar.google.com',
    )
    expect(decodeScholarResultUrl('//scholar.google.com/foo')).toBe(
      'https://scholar.google.com/foo',
    )
    expect(decodeScholarResultUrl('')).toBe('')
  })

  it('detects blocked pages', () => {
    expect(isScholarAccessBlocked('unusual traffic from your network')).toBe(
      true,
    )
    expect(isScholarAccessBlocked("can't load")).toBe(true)
    expect(
      isScholarAccessBlocked('', 'https://www.google.com/sorry/index'),
    ).toBe(true)
    expect(isScholarAccessBlocked('<div class="gs_ri">results</div>')).toBe(
      false,
    )
  })

  it('exposes engine helpers', () => {
    const spec = googleScholarSearchEngine.buildCrawlRequest('ai ethics', {
      category: 'article',
    })
    expect(spec.url).toContain('scholar.google.com')
    expect(googleScholarSearchEngine.getCrawlModes()).toEqual([
      'playwright',
      'cheerio',
    ])
    expect(googleScholarSearchEngine.getPlaywrightRunOptions().waitSelector).toContain(
      'gs_rt',
    )
    expect(googleScholarSearchEngine.emptyResultsMessage('https://x')).toContain(
      'No Google Scholar',
    )
    expect(SEARCH_CRAWLER_USER_AGENT).toContain('Chrome')
  })

  it('searchGoogleScholar returns results from cheerio', async () => {
    const handlers = mockScholarHandlers({
      cheerio: {
        $: cheerio.load(scholarSampleHtml),
        requestUrl: 'https://scholar.google.com/scholar?q=test',
        html: scholarSampleHtml,
      },
    })

    const outcome = await searchGoogleScholar(
      'transformers',
      5,
      { category: 'article' },
      handlers,
    )

    expect(outcome.results).toHaveLength(2)
    expect(outcome.error).toBeUndefined()
    expect(outcome.scopeLabel).toContain('scholarly articles')
    expect(outcome.searchUrl).toContain('scholar.google.com')
  })

  it('falls back to playwright when cheerio is blocked', async () => {
    const handlers = mockScholarHandlers({
      cheerio: {
        $: cheerio.load('unusual traffic'),
        requestUrl: 'https://scholar.google.com/scholar?q=test',
        html: 'unusual traffic from your network',
      },
      playwright: {
        $: cheerio.load(scholarSampleHtml),
        requestUrl: 'https://scholar.google.com/scholar?q=test',
        html: scholarSampleHtml,
      },
    })

    const outcome = await searchGoogleScholar(
      'contracts',
      5,
      { category: 'case_law_federal' },
      handlers,
    )

    expect(outcome.results).toHaveLength(2)
    expect(outcome.fetchMode).toBe('playwright')
    expect(handlers.playwright.fetch).toHaveBeenCalled()
  })

  it('returns error when all modes fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [] }),
      })),
    )

    const handlers = mockScholarHandlers({
      cheerio: {
        $: cheerio.load('<html></html>'),
        requestUrl: 'https://scholar.google.com/scholar?q=empty',
        html: '<html></html>',
      },
      playwright: {
        $: cheerio.load('<html></html>'),
        requestUrl: 'https://scholar.google.com/scholar?q=empty',
        html: '<html></html>',
      },
    })

    const outcome = await searchGoogleScholar(
      'nothing',
      5,
      { category: 'article' },
      handlers,
    )

    expect(outcome.results).toHaveLength(0)
    expect(outcome.error).toMatch(/No Google Scholar|No OpenAlex|No scholarly/)
    vi.unstubAllGlobals()
  })

  it('captures handler throw as error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [] }),
      })),
    )

    const handlers = mockScholarHandlers({
      cheerio: new Error('network down'),
      playwright: new Error('playwright down'),
    })

    const outcome = await searchGoogleScholar(
      'error',
      5,
      { category: 'article' },
      handlers,
    )

    expect(outcome.results).toHaveLength(0)
    expect(outcome.error).toBe('network down')
    vi.unstubAllGlobals()
  })

  it('falls back to OpenAlex when scholar crawl returns no rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'https://openalex.org/W999',
              display_name: 'Fallback Paper',
              doi: '10.5555/fallback',
              publication_year: 2023,
              authorships: [{ author: { display_name: 'Research Author' } }],
            },
          ],
        }),
      })),
    )

    const handlers = mockScholarHandlers({
      cheerio: {
        $: cheerio.load('unusual traffic'),
        requestUrl: 'https://scholar.google.com/scholar?q=test',
        html: 'unusual traffic from your network',
      },
      playwright: {
        $: cheerio.load('unusual traffic'),
        requestUrl: 'https://scholar.google.com/scholar?q=test',
        html: 'unusual traffic from your network',
      },
    })

    const outcome = await searchGoogleScholar(
      'blocked topic',
      5,
      { category: 'article' },
      handlers,
    )

    expect(outcome.results).toHaveLength(1)
    expect(outcome.source).toBe('openalex')
    expect(outcome.results[0]?.title).toBe('Fallback Paper')
    vi.unstubAllGlobals()
  })
})
