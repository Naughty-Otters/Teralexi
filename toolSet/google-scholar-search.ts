import type { CheerioAPI } from 'cheerio'
import {
  defaultSearchCrawlerHandlers,
  type SearchCrawlerHandlerRegistry,
} from './search-crawlers'
import { runSearchCrawlLoop, type SearchCrawlEngineAdapter } from './search-crawl-loop'
import {
  buildGoogleScholarSearchUrl,
  describeScholarSearchScope,
  type ScholarSearchScope,
} from './scholar-courts'
import { searchOpenAlex } from './openalex-scholar-search'
import type {
  SearchCrawlRequest,
  SearchCrawlerRunOptions,
  SearchParseContext,
  WebSearchResult,
} from './web-search-engines'
import { SEARCH_CRAWLER_USER_AGENT } from './web-search-engines'

function collapseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function decodeScholarResultUrl(href: string): string {
  const trimmed = href.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('/')) {
    return new URL(trimmed, 'https://scholar.google.com').toString()
  }
  return trimmed
}

export function isScholarAccessBlocked(
  html: string,
  requestUrl = '',
): boolean {
  if (/google\.com\/sorry|\/sorry\/index/i.test(requestUrl)) return true
  return (
    /captcha|unusual traffic|not a robot|sorry|recaptcha|detected unusual traffic/i.test(
      html,
    ) ||
    /enable javascript|can't load|enablejs|httpservice\/retry\/enablejs/i.test(
      html,
    ) ||
    /SG_REL|trouble accessing/i.test(html)
  )
}

export function parseScholarHtmlResults(
  $: CheerioAPI,
  maxResults: number,
): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const seenUrls = new Set<string>()

  const rows = $('.gs_ri, div.gs_r')
  rows.each((_, element) => {
    if (results.length >= maxResults) return false

    const block = $(element)
    const titleAnchor = block.find('h3.gs_rt a').first()
    const href = titleAnchor.attr('href')?.trim()
    const title = collapseText(titleAnchor.text())
    if (!href || !title) return

    const url = decodeScholarResultUrl(href)
    if (!url.startsWith('http') || seenUrls.has(url)) return
    seenUrls.add(url)

    const meta = collapseText(block.find('.gs_a').first().text())
    const snippet = collapseText(block.find('.gs_rs').first().text())
    const combinedSnippet = [meta, snippet].filter(Boolean).join(' — ')

    results.push({
      title,
      url,
      snippet: combinedSnippet,
    })
  })

  return results
}

export class GoogleScholarSearchEngine {
  getPlaywrightWaitSelector(): string {
    return 'h3.gs_rt a, .gs_ri, div.gs_r'
  }

  getCrawlModes(): Array<'cheerio' | 'playwright'> {
    // Scholar blocks plain HTTP fetches; try headless browser first.
    return ['playwright', 'cheerio']
  }

  buildCrawlRequest(query: string, scope: ScholarSearchScope): SearchCrawlRequest {
    const url = buildGoogleScholarSearchUrl(query, scope)
    return {
      url,
      method: 'GET',
      label: url,
      headers: {
        Referer: 'https://scholar.google.com/',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }
  }

  getPlaywrightRunOptions(): SearchCrawlerRunOptions {
    return { waitSelector: this.getPlaywrightWaitSelector() }
  }

  isAccessBlocked(html: string, requestUrl = ''): boolean {
    return isScholarAccessBlocked(html, requestUrl)
  }

  shouldSkipPlaywrightAfterCheerioBlock(): boolean {
    return false
  }

  parseResults(
    $: CheerioAPI,
    maxResults: number,
    _context?: SearchParseContext,
  ): WebSearchResult[] {
    return parseScholarHtmlResults($, maxResults)
  }

  emptyResultsMessage(requestUrl: string): string {
    return `No Google Scholar results parsed from ${requestUrl}. Scholar may have blocked automated access or the page layout changed.`
  }
}

export const googleScholarSearchEngine = new GoogleScholarSearchEngine()

export async function searchGoogleScholar(
  query: string,
  maxResults: number,
  scope: ScholarSearchScope,
  handlers: SearchCrawlerHandlerRegistry = defaultSearchCrawlerHandlers,
): Promise<{
  results: WebSearchResult[]
  searchUrl: string
  scopeLabel: string
  error?: string
  fetchMode?: 'cheerio' | 'playwright'
  source?: 'google_scholar' | 'openalex'
}> {
  const crawlSpec = googleScholarSearchEngine.buildCrawlRequest(query, scope)
  const searchUrl = crawlSpec.label ?? crawlSpec.url
  const scopeLabel = describeScholarSearchScope(scope)

  const engine: SearchCrawlEngineAdapter = {
    getCrawlModes: () => googleScholarSearchEngine.getCrawlModes(),
    getPlaywrightRunOptions: () =>
      googleScholarSearchEngine.getPlaywrightRunOptions(),
    isAccessBlocked: (html, requestUrl) =>
      googleScholarSearchEngine.isAccessBlocked(html, requestUrl),
    parseResults: ($, max, context) =>
      googleScholarSearchEngine.parseResults($, max, context),
    emptyResultsMessage: (requestUrl) =>
      googleScholarSearchEngine.emptyResultsMessage(requestUrl),
    shouldSkipPlaywrightAfterCheerioBlock: () =>
      googleScholarSearchEngine.shouldSkipPlaywrightAfterCheerioBlock(),
  }

  const { results, error, fetchMode } = await runSearchCrawlLoop(
    engine,
    crawlSpec,
    maxResults,
    handlers,
  )

  if (results.length > 0) {
    return {
      results,
      searchUrl,
      scopeLabel,
      error,
      fetchMode,
      source: 'google_scholar',
    }
  }

  const openAlex = await searchOpenAlex(query, maxResults)
  if (openAlex.results.length > 0) {
    return {
      results: openAlex.results,
      searchUrl: openAlex.searchUrl,
      scopeLabel: `${scopeLabel} (OpenAlex fallback)`,
      source: 'openalex',
    }
  }

  return {
    results,
    searchUrl,
    scopeLabel,
    error:
      error ??
      openAlex.error ??
      `No scholarly results for "${query.trim()}" (Google Scholar blocked; OpenAlex had no hits).`,
    fetchMode,
  }
}

export { SEARCH_CRAWLER_USER_AGENT }
