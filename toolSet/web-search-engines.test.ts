import * as cheerio from 'cheerio'
import { describe, expect, it } from 'vitest'
import {
  BingSearchEngine,
  DuckDuckGoSearchEngine,
  GoogleSearchEngine,
  StartpageSearchEngine,
  YandexSearchEngine,
  parseStartpageHtmlResults,
  SearchEngineRegistry,
  decodeDuckDuckGoResultUrl,
  decodeGoogleResultUrl,
  decodeYandexResultUrl,
  isGoogleAccessBlocked,
  isYandexAccessBlocked,
  parseYandexHtmlResults,
  resolveSearchEngineOrder,
} from './web-search-engines'

const ddgSampleHtml = `
<html><body>
  <div class="result results_links web-result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example title</a>
    <a class="result__snippet">A short snippet about the page.</a>
  </div>
</body></html>
`

describe('SearchEngine OO', () => {
  it('exposes static configuration on each engine class', () => {
    expect(DuckDuckGoSearchEngine.configuration.id).toBe('duckduckgo')
    expect(DuckDuckGoSearchEngine.configuration.selectors.resultRow).toBe(
      '.result.results_links',
    )
    expect(BingSearchEngine.configuration.selectors.resultRow).toBe('li.b_algo')
    expect(GoogleSearchEngine.configuration.selectors.resultRow).toBe(
      'motion.div.g, div.g',
    )
    expect(new DuckDuckGoSearchEngine().getCrawlModes()).toEqual([
      'cheerio',
      'playwright',
    ])
    expect(new BingSearchEngine().getCrawlModes()).toEqual([
      'cheerio',
      'playwright',
    ])
    expect(new GoogleSearchEngine().getCrawlModes()).toEqual([
      'cheerio',
      'playwright',
    ])
    expect(YandexSearchEngine.configuration.selectors.resultRow).toBe(
      'li.serp-item',
    )
  })

  it('uses Playwright and standard Yandex search URL', () => {
    const engine = new YandexSearchEngine()
    expect(engine.getCrawlModes()).toEqual(['cheerio', 'playwright'])
    const spec = engine.buildCrawlRequest('test', 5)
    expect(spec.url).toContain('yandex.com/search')
    expect(spec.url).toContain('text=test')
    expect(spec.method).toBe('GET')
  })

  it('uses POST to the HTML endpoint (GET is blocked or empty)', () => {
    const engine = new DuckDuckGoSearchEngine()
    const spec = engine.buildCrawlRequest('test query', 5)
    expect(spec.method).toBe('POST')
    expect(spec.url).toBe('https://html.duckduckgo.com/html/')
    expect(spec.payload).toContain('q=test+query')
    expect(spec.label).toContain('q=test')
  })

  it('offers GET HTML fallback when POST is blocked', () => {
    const engine = new DuckDuckGoSearchEngine()
    const spec = engine.buildFallbackCrawlRequest('test query', 5)
    expect(spec?.method).toBe('GET')
    expect(spec?.url).toContain('q=test')
  })

  it('parses HTML via instance parseResults', () => {
    const engine = new DuckDuckGoSearchEngine()
    const results = engine.parseResults(cheerio.load(ddgSampleHtml), 5)
    expect(results[0]?.url).toBe('https://example.com/page')
  })

  it('registry resolves default cascade order', () => {
    const registry = new SearchEngineRegistry()
    expect(registry.resolveOrder()).toEqual([
      'duckduckgo',
      'bing',
      'google',
      'yandex',
      'startpage',
    ])
    expect(registry.ordered(['google', 'bing']).map((e) => e.id)).toEqual([
      'google',
      'bing',
    ])
  })
})

describe('decodeDuckDuckGoResultUrl', () => {
  it('decodes redirect links', () => {
    expect(
      decodeDuckDuckGoResultUrl(
        '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage',
      ),
    ).toBe('https://example.com/page')
  })
})

const yandexLegacyHtml = `
<ul>
  <li class="serp-item">
    <h3 class="b-serp-item__title">
      <a class="b-serp-item__title-link" href="https://example.com/legacy"><span>Legacy title</span></a>
    </h3>
    <div class="b-serp-item__content"><div class="b-serp-item__text">Legacy snippet</div></div>
  </li>
</ul>
`

const yandexModernHtml = `
<ul>
  <li class="serp-item">
    <div class="Organic">
      <a class="Link OrganicTitle-Link" href="https://yandex.com/clck/jsredir?url=https%3A%2F%2Fexample.com%2Fmodern">Modern title</a>
      <div class="OrganicText">Modern snippet</div>
    </div>
  </li>
</ul>
`

describe('parseYandexHtmlResults', () => {
  it('parses legacy b-serp-item markup', () => {
    const results = parseYandexHtmlResults(cheerio.load(yandexLegacyHtml), 5)
    expect(results[0]).toEqual({
      title: 'Legacy title',
      url: 'https://example.com/legacy',
      snippet: 'Legacy snippet',
    })
  })

  it('parses modern Organic markup and decodes clck urls', () => {
    const results = parseYandexHtmlResults(cheerio.load(yandexModernHtml), 5)
    expect(results[0]).toEqual({
      title: 'Modern title',
      url: 'https://example.com/modern',
      snippet: 'Modern snippet',
    })
  })
})

describe('decodeYandexResultUrl', () => {
  it('decodes clck redirect urls', () => {
    expect(
      decodeYandexResultUrl(
        'https://yandex.com/clck/jsredir?url=https%3A%2F%2Fexample.com%2Fmodern',
      ),
    ).toBe('https://example.com/modern')
  })
})

describe('decodeGoogleResultUrl', () => {
  it('decodes /url?q= links', () => {
    expect(
      decodeGoogleResultUrl('/url?q=https%3A%2F%2Fexample.com%2Fgoogle&sa=X'),
    ).toBe('https://example.com/google')
  })
})

const startpageSampleHtml = `
<div class="result">
  <h2>Earth mass - Wikipedia</h2>
  <a href="https://en.wikipedia.org/wiki/Earth_mass">Wikipedia</a>
  <p>The current best estimate for the mass of Earth is about 5.9722×10^24 kg.</p>
</div>
`

describe('StartpageSearchEngine', () => {
  it('parses Startpage result rows', () => {
    const results = parseStartpageHtmlResults(
      cheerio.load(startpageSampleHtml),
      5,
    )
    expect(results[0]).toEqual({
      title: 'Earth mass - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Earth_mass',
      snippet: expect.stringContaining('5.9722'),
    })
  })
})

describe('isYandexAccessBlocked', () => {
  it('detects showcaptcha redirect', () => {
    expect(
      isYandexAccessBlocked('', 'https://yandex.com/showcaptcha?cc=1'),
    ).toBe(true)
  })
})

describe('isGoogleAccessBlocked', () => {
  it('detects sorry page and enablejs shell', () => {
    expect(
      isGoogleAccessBlocked(
        '<noscript>enablejs</noscript>',
        'https://www.google.com/search?q=x',
      ),
    ).toBe(true)
    expect(
      isGoogleAccessBlocked('', 'https://www.google.com/sorry/index'),
    ).toBe(true)
  })
})

describe('resolveSearchEngineOrder', () => {
  it('deduplicates custom order', () => {
    expect(
      resolveSearchEngineOrder(['google', 'google', 'bing']),
    ).toEqual(['google', 'bing'])
  })
})
