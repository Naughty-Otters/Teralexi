import type { CheerioAPI } from 'cheerio'
import type {
  SearchCrawlMode,
  SearchCrawlRequest,
  SearchCrawlerRunOptions,
  SearchParseContext,
  WebSearchResult,
} from './web-search-engines'
import type { SearchCrawlerHandlerRegistry } from './search-crawlers'

export type SearchCrawlAttempt = {
  spec: SearchCrawlRequest
  playwrightOptions: SearchCrawlerRunOptions
}

/** Minimal engine surface for Cheerio → Playwright crawl loops. */
export type SearchCrawlEngineAdapter = {
  getCrawlModes(): SearchCrawlMode[]
  getPlaywrightRunOptions(): SearchCrawlerRunOptions
  getPlaywrightFallbackRunOptions?(
    fallback: SearchCrawlRequest,
  ): SearchCrawlerRunOptions
  buildFallbackCrawlRequest?(): SearchCrawlRequest | undefined
  isAccessBlocked(html: string, requestUrl: string): boolean
  parseResults(
    $: CheerioAPI,
    maxResults: number,
    context?: SearchParseContext,
  ): WebSearchResult[]
  emptyResultsMessage(requestUrl: string): string
  shouldSkipPlaywrightAfterCheerioBlock?(): boolean
}

export type SearchCrawlLoopResult = {
  results: WebSearchResult[]
  error?: string
  /** Last crawl mode that produced parseable results, when any. */
  fetchMode?: SearchCrawlMode
}

export async function runSearchCrawlLoop(
  engine: SearchCrawlEngineAdapter,
  primarySpec: SearchCrawlRequest,
  maxResults: number,
  handlers: SearchCrawlerHandlerRegistry,
): Promise<SearchCrawlLoopResult> {
  const results: WebSearchResult[] = []
  let loadError: string | undefined
  let fetchMode: SearchCrawlMode | undefined

  const crawlAttempts: SearchCrawlAttempt[] = [
    {
      spec: primarySpec,
      playwrightOptions: engine.getPlaywrightRunOptions(),
    },
  ]
  const fallback = engine.buildFallbackCrawlRequest?.()
  if (fallback) {
    crawlAttempts.push({
      spec: fallback,
      playwrightOptions:
        engine.getPlaywrightFallbackRunOptions?.(fallback) ??
        engine.getPlaywrightRunOptions(),
    })
  }

  const ingestPage = async (
    mode: SearchCrawlMode,
    $: CheerioAPI,
    requestUrl: string,
    html?: string,
  ) => {
    if (html && engine.isAccessBlocked(html, requestUrl)) {
      loadError = engine.emptyResultsMessage(requestUrl)
      return
    }
    const context: SearchParseContext = { requestUrl }
    const parsed = engine.parseResults($, maxResults, context)
    if (parsed.length === 0) {
      loadError = engine.emptyResultsMessage(requestUrl)
      return
    }
    results.length = 0
    results.push(...parsed)
    loadError = undefined
    fetchMode = mode
  }

  try {
    outer: for (const attempt of crawlAttempts) {
      let cheerioBlocked = false
      for (const mode of engine.getCrawlModes()) {
        if (
          mode === 'playwright' &&
          cheerioBlocked &&
          engine.shouldSkipPlaywrightAfterCheerioBlock?.()
        ) {
          continue
        }
        try {
          const handler = handlers.get(mode)
          const runOptions =
            mode === 'playwright' ? attempt.playwrightOptions : undefined
          const page = await handler.fetch(attempt.spec, runOptions)
          if (
            mode === 'cheerio' &&
            engine.isAccessBlocked(page.html, page.requestUrl)
          ) {
            cheerioBlocked = true
            loadError = engine.emptyResultsMessage(page.requestUrl)
            continue
          }
          await ingestPage(mode, page.$, page.requestUrl, page.html)
          if (results.length > 0) break outer
        } catch (e) {
          loadError = e instanceof Error ? e.message : String(e)
        }
      }
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

  return {
    results,
    error: results.length === 0 ? loadError : undefined,
    fetchMode,
  }
}
