import type { CheerioAPI } from 'cheerio'
import { z } from 'zod'

export const searchEngineId = z.enum([
  'duckduckgo',
  'bing',
  'google',
  'yandex',
  'startpage',
])

export type SearchEngineId = z.infer<typeof searchEngineId>

export type WebSearchResult = {
  title: string
  url: string
  snippet: string
}

/** DOM selectors and metadata for one HTML search provider. */
export type SearchEngineConfig = {
  id: SearchEngineId
  displayName: string
  selectors: {
    resultRow: string
    titleLink: string
    snippet: string
  }
}

export const DEFAULT_SEARCH_ENGINE_ORDER: SearchEngineId[] = [
  'duckduckgo',
  'bing',
  'google',
  'yandex',
  'startpage',
]

export type SearchEngineAttempt = {
  engine: SearchEngineId
  success: boolean
  searchUrl: string
  resultCount?: number
  error?: string
}

/** How Crawlee should fetch a search results page (GET or POST). */
export type SearchCrawlRequest = {
  url: string
  method?: 'GET' | 'POST'
  payload?: string
  headers?: Record<string, string>
  /** Human-readable URL shown in tool output (e.g. includes query string). */
  label?: string
}

/** Cheerio HTTP fetch, or headless Chromium for JS-rendered SERPs. */
export type SearchCrawlMode = 'cheerio' | 'playwright'

export type SearchParseContext = {
  requestUrl?: string
}

/** Options passed to Playwright when fetching a SERP (see {@link PlaywrightSearchHandler}). */
export type SearchCrawlerRunOptions = {
  waitSelector?: string
}

/** Browser-like UA; DuckDuckGo blocks custom/bot user agents on the HTML endpoint. */
export const SEARCH_CRAWLER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function collapseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Decode DuckDuckGo redirect links from the HTML results page. */
export function decodeDuckDuckGoResultUrl(href: string): string {
  const normalized = href.startsWith('//') ? `https:${href}` : href
  try {
    const parsed = new URL(normalized)
    if (
      parsed.hostname.includes('duckduckgo.com') &&
      parsed.pathname.startsWith('/l/')
    ) {
      const target = parsed.searchParams.get('uddg')
      if (target) return decodeURIComponent(target)
    }
  } catch {
    /* use href as-is */
  }
  return normalized
}

/** Decode Yandex `clck` / redirect links to the target URL. */
export function decodeYandexResultUrl(href: string): string {
  const normalized = href.startsWith('//') ? `https:${href}` : href
  try {
    const parsed = new URL(normalized)
    if (parsed.hostname.includes('yandex.')) {
      const direct =
        parsed.searchParams.get('url') ??
        parsed.searchParams.get('u') ??
        parsed.searchParams.get('to')
      if (direct) return decodeURIComponent(direct)
    }
  } catch {
    /* use href as-is */
  }
  return normalized
}

/** Decode Google `/url?q=…` redirect links. */
export function decodeGoogleResultUrl(href: string): string {
  try {
    const base = href.startsWith('http')
      ? href
      : `https://www.google.com${href.startsWith('/') ? href : `/${href}`}`
    const parsed = new URL(base)
    if (
      parsed.hostname.includes('google.') &&
      (parsed.pathname === '/url' || parsed.pathname.startsWith('/url'))
    ) {
      const target = parsed.searchParams.get('q')
      if (target) return decodeURIComponent(target)
    }
  } catch {
    /* use href as-is */
  }
  return href
}

/**
 * Base search engine: holds {@link SearchEngineConfig} and defines URL building
 * plus HTML parsing. Subclasses supply provider-specific behavior.
 */
export abstract class SearchEngine {
  constructor(protected readonly config: SearchEngineConfig) {}

  get id(): SearchEngineId {
    return this.config.id
  }

  abstract buildSearchUrl(query: string, maxResults: number): string

  /** Override when the provider requires POST or extra headers (e.g. DuckDuckGo HTML). */
  buildCrawlRequest(query: string, maxResults: number): SearchCrawlRequest {
    const url = this.buildSearchUrl(query, maxResults)
    return { url, method: 'GET', label: url }
  }

  /** Crawl modes to try, in order, until results are parsed. */
  getCrawlModes(): SearchCrawlMode[] {
    return ['cheerio', 'playwright']
  }

  /** Playwright-only options for the primary crawl request. */
  getPlaywrightRunOptions(): SearchCrawlerRunOptions {
    return { waitSelector: this.getPlaywrightWaitSelector() }
  }

  /** Playwright-only options for a fallback crawl request (e.g. Startpage). */
  getPlaywrightFallbackRunOptions(
    fallback: SearchCrawlRequest,
  ): SearchCrawlerRunOptions {
    if (fallback.url.includes('startpage.com')) {
      return { waitSelector: '.result h2, .result a[href^="http"]' }
    }
    return this.getPlaywrightRunOptions()
  }

  /** Optional selector to wait for after navigation in Playwright mode. */
  getPlaywrightWaitSelector(): string | undefined {
    return undefined
  }

  /** Whether the fetched page indicates a block/CAPTCHA instead of results. */
  isAccessBlocked(html: string, requestUrl: string): boolean {
    return false
  }

  /** Optional Cheerio fallback when the primary crawl yields no parseable rows. */
  buildFallbackCrawlRequest(
    _query: string,
    _maxResults: number,
  ): SearchCrawlRequest | undefined {
    return undefined
  }

  abstract parseResults(
    $: CheerioAPI,
    maxResults: number,
    context?: SearchParseContext,
  ): WebSearchResult[]

  /** Override when result links need provider-specific decoding. */
  protected decodeResultUrl(href: string): string {
    return href
  }

  emptyResultsMessage(requestUrl: string): string {
    return `No ${this.config.id} results parsed from ${requestUrl}. The page layout may have changed or access was blocked.`
  }

  /**
   * When true, a Cheerio CAPTCHA/block skips Playwright for the same crawl spec.
   * Most engines still benefit from Playwright after Cheerio fails (e.g. Yandex).
   */
  shouldSkipPlaywrightAfterCheerioBlock(): boolean {
    return false
  }
}

export class DuckDuckGoSearchEngine extends SearchEngine {
  static readonly htmlEndpoint = 'https://html.duckduckgo.com/html/'

  static readonly configuration: SearchEngineConfig = {
    id: 'duckduckgo',
    displayName: 'DuckDuckGo',
    selectors: {
      resultRow: '.result.results_links',
      titleLink: 'a.result__a',
      snippet: '.result__snippet',
    },
  }

  constructor() {
    super(DuckDuckGoSearchEngine.configuration)
  }

  getPlaywrightWaitSelector(): string {
    return '.result.results_links, a.result__a'
  }

  isAccessBlocked(html: string, requestUrl: string): boolean {
    return /captcha|challenge|anomaly-modal|bots use duckduckgo/i.test(html)
  }

  buildSearchUrl(query: string, _maxResults: number): string {
    const url = new URL(DuckDuckGoSearchEngine.htmlEndpoint)
    url.searchParams.set('q', query.trim())
    return url.toString()
  }

  buildCrawlRequest(query: string, maxResults: number): SearchCrawlRequest {
    const body = new URLSearchParams()
    body.set('q', query.trim())
    body.set('b', '')
    return {
      url: DuckDuckGoSearchEngine.htmlEndpoint,
      method: 'POST',
      payload: body.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://html.duckduckgo.com',
        Referer: 'https://html.duckduckgo.com/',
      },
      label: this.buildSearchUrl(query, maxResults),
    }
  }

  /** GET HTML search when POST returns a CAPTCHA or empty body. */
  buildFallbackCrawlRequest(query: string, maxResults: number): SearchCrawlRequest {
    const url = new URL(DuckDuckGoSearchEngine.htmlEndpoint)
    url.searchParams.set('q', query.trim())
    return {
      url: url.toString(),
      method: 'GET',
      label: this.buildSearchUrl(query, maxResults),
    }
  }

  protected decodeResultUrl(href: string): string {
    return decodeDuckDuckGoResultUrl(href)
  }

  private extractTitle(
    row: ReturnType<CheerioAPI>,
    link: ReturnType<CheerioAPI>,
  ): string {
    return (
      collapseText(link.text()) ||
      collapseText(row.find('.result__title').first().text()) ||
      collapseText(row.find('h2').first().text())
    )
  }

  parseResults(
    $: CheerioAPI,
    maxResults: number,
    _context?: SearchParseContext,
  ): WebSearchResult[] {
    const { resultRow, titleLink, snippet } = this.config.selectors
    const results: WebSearchResult[] = []
    const seenUrls = new Set<string>()

    const rows =
      $(resultRow).length > 0 ? $(resultRow) : $('.result.web-result, .result')

    rows.each((_, element) => {
      if (results.length >= maxResults) return false

      const row = $(element)
      const link = row.find(titleLink).first()
      const href = link.attr('href')?.trim()
      const title = this.extractTitle(row, link)
      if (!href || !title) return

      const url = this.decodeResultUrl(href)
      if (!url.startsWith('http') || seenUrls.has(url)) return
      seenUrls.add(url)

      results.push({
        title,
        url,
        snippet: collapseText(row.find(snippet).text()),
      })
    })

    return results
  }
}

export class BingSearchEngine extends SearchEngine {
  static readonly configuration: SearchEngineConfig = {
    id: 'bing',
    displayName: 'Bing',
    selectors: {
      resultRow: 'li.b_algo',
      titleLink: 'h2 a',
      snippet: '.b_caption p, .b_algoSlug, .b_lineclamp2, .b_snippet',
    },
  }

  constructor() {
    super(BingSearchEngine.configuration)
  }

  getPlaywrightWaitSelector(): string {
    return 'li.b_algo, #b_results'
  }

  private findTitleLink(
    row: ReturnType<CheerioAPI>,
    $: CheerioAPI,
  ): ReturnType<CheerioAPI> {
    const { titleLink } = this.config.selectors
    const h2Link = row.find(titleLink).first()
    if (h2Link.attr('href') && collapseText(h2Link.text())) return h2Link

    let best: ReturnType<CheerioAPI> | undefined
    let bestLen = 0
    row.find('a[href]').each((_, anchor) => {
      const link = $(anchor)
      const href = link.attr('href')?.trim() ?? ''
      const title = collapseText(link.text())
      if (!href.startsWith('http')) return
      if (title.length < 8 || title.includes('›')) return
      if (title.length > bestLen) {
        best = link
        bestLen = title.length
      }
    })
    return best ?? row.find('a[href^="http"]').first()
  }

  buildSearchUrl(query: string, maxResults: number): string {
    const url = new URL('https://www.bing.com/search')
    url.searchParams.set('q', query.trim())
    url.searchParams.set('count', String(Math.min(maxResults, 50)))
    return url.toString()
  }

  parseResults(
    $: CheerioAPI,
    maxResults: number,
    _context?: SearchParseContext,
  ): WebSearchResult[] {
    const { resultRow, titleLink, snippet } = this.config.selectors
    const results: WebSearchResult[] = []

    $(resultRow).each((_, element) => {
      if (results.length >= maxResults) return false

      const row = $(element)
      const link = this.findTitleLink(row, $)
      const href = link.attr('href')?.trim()
      const title = collapseText(link.text())
      if (!href || !title || !href.startsWith('http')) return

      results.push({
        title,
        url: href,
        snippet: collapseText(row.find(snippet).first().text()),
      })
    })

    return results
  }
}

/** Startpage proxies Google’s index and returns static HTML suitable for Cheerio. */
export function buildStartpageSearchUrl(query: string): string {
  const url = new URL('https://www.startpage.com/sp/search')
  url.searchParams.set('query', query.trim())
  url.searchParams.set('language', 'english')
  return url.toString()
}

/** Parse Startpage `.result` rows (shared by Google fallback and {@link StartpageSearchEngine}). */
export function parseStartpageHtmlResults(
  $: CheerioAPI,
  maxResults: number,
): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const seenUrls = new Set<string>()

  $('.result').each((_, element) => {
    if (results.length >= maxResults) return false

    const row = $(element)
    const link = row.find('a[href^="http"]').first()
    const href = link.attr('href')?.trim()
    const title =
      collapseText(row.find('h2').first().text()) ||
      collapseText(link.text())
    if (!href || !title || title.length < 3) return
    if (seenUrls.has(href)) return
    seenUrls.add(href)

    const snippet = collapseText(
      row
        .find('p')
        .filter((_, p) => collapseText($(p).text()).length > 20)
        .first()
        .text(),
    )

    results.push({ title, url: href, snippet })
  })

  return results
}

export function isGoogleAccessBlocked(
  html: string,
  requestUrl: string,
): boolean {
  if (/google\.com\/sorry|\/sorry\/index/i.test(requestUrl)) return true
  return (
    /unusual traffic|recaptcha|detected unusual traffic/i.test(html) ||
    /enablejs|httpservice\/retry\/enablejs/i.test(html) ||
    /SG_REL|trouble accessing Google Search/i.test(html)
  )
}

export class GoogleSearchEngine extends SearchEngine {
  static readonly configuration: SearchEngineConfig = {
    id: 'google',
    displayName: 'Google',
    selectors: {
      resultRow: 'motion.div.g, div.g',
      titleLink: 'h3',
      snippet: '.VwiC3b, .st, .IsZvec, .hiQRQb, [data-sncf]',
    },
  }

  constructor() {
    super(GoogleSearchEngine.configuration)
  }

  getPlaywrightWaitSelector(): string {
    return 'motion.div.g h3, div.g h3'
  }

  isAccessBlocked(html: string, requestUrl: string): boolean {
    return isGoogleAccessBlocked(html, requestUrl)
  }

  buildSearchUrl(query: string, maxResults: number): string {
    const url = new URL('https://www.google.com/search')
    url.searchParams.set('q', query.trim())
    url.searchParams.set('hl', 'en')
    url.searchParams.set('num', String(Math.min(maxResults, 10)))
    return url.toString()
  }

  buildFallbackCrawlRequest(query: string, maxResults: number): SearchCrawlRequest {
    const url = buildStartpageSearchUrl(query)
    return {
      url,
      method: 'GET',
      label: this.buildSearchUrl(query, maxResults),
    }
  }

  protected decodeResultUrl(href: string): string {
    return decodeGoogleResultUrl(href)
  }

  parseResults(
    $: CheerioAPI,
    maxResults: number,
    context?: SearchParseContext,
  ): WebSearchResult[] {
    if (context?.requestUrl?.includes('startpage.com')) {
      return parseStartpageHtmlResults($, maxResults)
    }
    return this.parseGoogleOrganicResults($, maxResults)
  }

  parseGoogleOrganicResults(
    $: CheerioAPI,
    maxResults: number,
  ): WebSearchResult[] {
    const { resultRow, snippet } = this.config.selectors
    const results: WebSearchResult[] = []
    const seenUrls = new Set<string>()

    $(resultRow).each((_, element) => {
      if (results.length >= maxResults) return false

      const block = $(element)
      const heading = block.find('h3').first()
      const anchor = heading.length
        ? heading.closest('a')
        : block.find('a:has(h3)').first()
      const href = anchor.attr('href')?.trim()
      const title = collapseText(heading.text())
      if (!href || !title) return

      const url = this.decodeResultUrl(href)
      if (!url.startsWith('http') || seenUrls.has(url)) return
      seenUrls.add(url)

      results.push({
        title,
        url,
        snippet: collapseText(block.find(snippet).first().text()),
      })
    })

    return results
  }

  emptyResultsMessage(requestUrl: string): string {
    if (requestUrl.includes('startpage.com')) {
      return `No Google results parsed from Startpage fallback (${requestUrl}).`
    }
    if (isGoogleAccessBlocked('', requestUrl)) {
      return 'Google blocked automated access (CAPTCHA / sorry page).'
    }
    return `No Google results parsed from ${requestUrl}. The page layout may have changed or access was blocked.`
  }
}

export function isYandexAccessBlocked(
  html: string,
  requestUrl: string,
): boolean {
  if (/showcaptcha|showcaptchafast/i.test(requestUrl)) return true
  return /showcaptcha|SmartCaptcha|not a robot/i.test(html)
}

export class StartpageSearchEngine extends SearchEngine {
  static readonly configuration: SearchEngineConfig = {
    id: 'startpage',
    displayName: 'Startpage',
    selectors: {
      resultRow: '.result',
      titleLink: 'h2, a[href^="http"]',
      snippet: 'p',
    },
  }

  constructor() {
    super(StartpageSearchEngine.configuration)
  }

  getPlaywrightWaitSelector(): string {
    return '.result h2, .result a[href^="http"]'
  }

  buildSearchUrl(query: string, _maxResults: number): string {
    return buildStartpageSearchUrl(query)
  }

  parseResults(
    $: CheerioAPI,
    maxResults: number,
    _context?: SearchParseContext,
  ): WebSearchResult[] {
    return parseStartpageHtmlResults($, maxResults)
  }
}

export class YandexSearchEngine extends SearchEngine {
  static readonly configuration: SearchEngineConfig = {
    id: 'yandex',
    displayName: 'Yandex',
    selectors: {
      resultRow: 'li.serp-item',
      titleLink:
        'a.b-serp-item__title-link, a.OrganicTitle-Link, h2.Organic-Title a',
      snippet:
        '.b-serp-item__text, .OrganicText, .Organic-Description, .ExtendedText',
    },
  }

  constructor() {
    super(YandexSearchEngine.configuration)
  }

  getPlaywrightWaitSelector(): string {
    return 'li.serp-item, a.OrganicTitle-Link'
  }

  isAccessBlocked(html: string, requestUrl: string): boolean {
    return isYandexAccessBlocked(html, requestUrl)
  }

  buildSearchUrl(query: string, _maxResults: number): string {
    const url = new URL('https://yandex.com/search/')
    url.searchParams.set('text', query.trim())
    url.searchParams.set('lr', '84')
    url.searchParams.set('lang', 'en')
    return url.toString()
  }

  protected decodeResultUrl(href: string): string {
    return decodeYandexResultUrl(href)
  }

  emptyResultsMessage(requestUrl: string): string {
    return `No yandex results parsed from ${requestUrl}. Yandex may have shown a CAPTCHA or blocked automated access.`
  }

  private extractTitle(
    row: ReturnType<CheerioAPI>,
    link: ReturnType<CheerioAPI>,
  ): string {
    return (
      collapseText(link.text()) ||
      collapseText(row.find('h2, h3').first().text()) ||
      collapseText(row.find('.OrganicTitle').first().text())
    )
  }

  parseResults(
    $: CheerioAPI,
    maxResults: number,
    _context?: SearchParseContext,
  ): WebSearchResult[] {
    const { resultRow, titleLink, snippet } = this.config.selectors
    const results: WebSearchResult[] = []
    const seenUrls = new Set<string>()

    $(resultRow).each((_, element) => {
      if (results.length >= maxResults) return false

      const row = $(element)
      const link = row.find(titleLink).first()
      const href = link.attr('href')?.trim()
      const title = this.extractTitle(row, link)
      if (!href || !title) return

      const url = this.decodeResultUrl(href)
      if (!url.startsWith('http') || seenUrls.has(url)) return
      seenUrls.add(url)

      results.push({
        title,
        url,
        snippet: collapseText(row.find(snippet).first().text()),
      })
    })

    return results
  }
}

/** Registry of built-in search engine instances keyed by id. */
export class SearchEngineRegistry {
  private readonly engines: Map<SearchEngineId, SearchEngine>

  constructor(instances: SearchEngine[] = SearchEngineRegistry.defaultInstances()) {
    this.engines = new Map(instances.map((engine) => [engine.id, engine]))
  }

  static defaultInstances(): SearchEngine[] {
    return [
      new DuckDuckGoSearchEngine(),
      new BingSearchEngine(),
      new GoogleSearchEngine(),
      new YandexSearchEngine(),
      new StartpageSearchEngine(),
    ]
  }

  get(id: SearchEngineId): SearchEngine {
    const engine = this.engines.get(id)
    if (!engine) {
      throw new Error(`Unknown search engine: ${id}`)
    }
    return engine
  }

  resolveOrder(engines?: SearchEngineId[]): SearchEngineId[] {
    const order = engines?.length ? engines : DEFAULT_SEARCH_ENGINE_ORDER
    const seen = new Set<SearchEngineId>()
    const resolved: SearchEngineId[] = []
    for (const id of order) {
      if (seen.has(id) || !this.engines.has(id)) continue
      seen.add(id)
      resolved.push(id)
    }
    return resolved.length > 0 ? resolved : [...DEFAULT_SEARCH_ENGINE_ORDER]
  }

  ordered(engines?: SearchEngineId[]): SearchEngine[] {
    return this.resolveOrder(engines).map((id) => this.get(id))
  }
}

export const defaultSearchEngineRegistry = new SearchEngineRegistry()

/** @deprecated Use {@link SearchEngineRegistry} or engine instances. */
export const SEARCH_ENGINE_DEFINITIONS = Object.fromEntries(
  defaultSearchEngineRegistry
    .ordered()
    .map((engine) => [
      engine.id,
      {
        id: engine.id,
        buildSearchUrl: (q: string, m: number) => engine.buildSearchUrl(q, m),
        parseResults: ($: CheerioAPI, m: number) => engine.parseResults($, m),
      },
    ]),
) as Record<
  SearchEngineId,
  {
    id: SearchEngineId
    buildSearchUrl: (query: string, maxResults: number) => string
    parseResults: ($: CheerioAPI, maxResults: number) => WebSearchResult[]
  }
>

export function resolveSearchEngineOrder(
  engines?: SearchEngineId[],
): SearchEngineId[] {
  return defaultSearchEngineRegistry.resolveOrder(engines)
}

// Thin wrappers for tests and backward compatibility
export const duckDuckGoSearchEngine = new DuckDuckGoSearchEngine()
export const bingSearchEngine = new BingSearchEngine()
export const googleSearchEngine = new GoogleSearchEngine()
export const yandexSearchEngine = new YandexSearchEngine()
export const startpageSearchEngine = new StartpageSearchEngine()

export function parseDuckDuckGoHtmlResults(
  $: CheerioAPI,
  maxResults: number,
): WebSearchResult[] {
  return duckDuckGoSearchEngine.parseResults($, maxResults)
}

export function parseBingHtmlResults(
  $: CheerioAPI,
  maxResults: number,
): WebSearchResult[] {
  return bingSearchEngine.parseResults($, maxResults)
}

export function parseGoogleHtmlResults(
  $: CheerioAPI,
  maxResults: number,
): WebSearchResult[] {
  return googleSearchEngine.parseResults($, maxResults)
}

export function parseYandexHtmlResults(
  $: CheerioAPI,
  maxResults: number,
): WebSearchResult[] {
  return yandexSearchEngine.parseResults($, maxResults)
}

