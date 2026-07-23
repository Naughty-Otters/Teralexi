import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LogLevel } from '@apify/log'
import { CheerioCrawler, Configuration } from 'crawlee'
import type { CheerioAPI } from 'cheerio'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
export { htmlToMarkdown, isParseableMarkdown } from './html-to-markdown'
import { htmlToMarkdown } from './html-to-markdown'
import {
  defaultSearchCrawlerHandlers,
  type SearchCrawlerHandlerRegistry,
} from './search-crawlers'
import { runSearchCrawlLoop, type SearchCrawlEngineAdapter } from './search-crawl-loop'
import {
  defaultSearchEngineRegistry,
  SEARCH_CRAWLER_USER_AGENT,
  searchEngineId,
  type SearchCrawlMode,
  type SearchCrawlRequest,
  type SearchCrawlerRunOptions,
  type SearchEngineAttempt,
  type SearchEngineId,
  type SearchParseContext,
  type WebSearchResult,
} from './web-search-engines'

export {
  CheerioCrawlerConfig,
  CheerioSearchHandler,
  PlaywrightCrawlerConfig,
  PlaywrightSearchHandler,
  SearchCrawlerHandler,
  SearchCrawlerHandlerRegistry,
  defaultSearchCrawlerHandlers,
  type SearchPagePayload,
} from './search-crawlers'

export {
  buildStartpageSearchUrl,
  decodeDuckDuckGoResultUrl,
  decodeGoogleResultUrl,
  defaultSearchEngineRegistry,
  parseBingHtmlResults,
  parseDuckDuckGoHtmlResults,
  parseGoogleHtmlResults,
  parseStartpageHtmlResults,
  parseYandexHtmlResults,
  decodeYandexResultUrl,
  isYandexAccessBlocked,
  resolveSearchEngineOrder,
  DEFAULT_SEARCH_ENGINE_ORDER,
  SEARCH_ENGINE_DEFINITIONS,
  SEARCH_CRAWLER_USER_AGENT,
  BingSearchEngine,
  DuckDuckGoSearchEngine,
  GoogleSearchEngine,
  StartpageSearchEngine,
  YandexSearchEngine,
  SearchEngine,
  SearchEngineRegistry,
  type SearchCrawlMode,
  type SearchCrawlRequest,
  type SearchCrawlerRunOptions,
  type SearchEngineAttempt,
  type SearchEngineConfig,
  type SearchEngineId,
  type SearchParseContext,
  type WebSearchResult,
} from './web-search-engines'

const DEFAULT_MAX_SEARCH_RESULTS = 8
const CRAWLER_TIMEOUT_SECS = 5

const crawlerPreNavigationHooks = [
  ({ request }: { request: { headers?: Record<string, string> } }) => {
    request.headers = {
      ...request.headers,
      'User-Agent': SEARCH_CRAWLER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  },
]

const webSearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query, e.g. "mass of Earth" or "quotes to scrape API".'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(DEFAULT_MAX_SEARCH_RESULTS)
    .describe('Maximum organic results to return (1–20).'),
  engines: z
    .array(searchEngineId)
    .optional()
    .describe(
      'Optional engine order. Defaults to duckduckgo → bing → google → yandex; tries each until results are found.',
    ),
})

/** Aligns with typical tool-output budgets so scrape results stay LLM-sized. */
export const DEFAULT_WEB_SCRAPE_MARKDOWN_MAX_CHARS = 12_000

const webScrapeInput = z.object({
  url: z.string().url().optional().describe('Single page URL to fetch.'),
  urls: z
    .array(z.string().url())
    .optional()
    .describe('Multiple page URLs to fetch in one call.'),
  maxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      `Per-page character cap for returned \`markdown\` (default ${DEFAULT_WEB_SCRAPE_MARKDOWN_MAX_CHARS}).`,
    ),
})

const MIN_MAIN_CONTENT_CHARS = 80

function createEphemeralCrawleeConfig(storageDir: string): Configuration {
  return new Configuration({
    persistStorage: true,
    purgeOnStart: true,
    logLevel: LogLevel.WARNING,
    storageClientOptions: { storageDir },
  })
}

export type PageExtractResult = {
  title: string
  /** Main-content markdown for the LLM (scripts/chrome stripped). */
  markdown: string
  truncated: boolean
}

function visibleTextLength(text: string): number {
  return text.replace(/\s+/g, ' ').trim().length
}

/** Strip scripts and other non-content nodes before region selection. */
export function pruneScrapeDom($: CheerioAPI): void {
  $(
    [
      'script',
      'style',
      'noscript',
      'template',
      'svg',
      'canvas',
      'iframe',
      'object',
      'embed',
      'link',
      'meta',
    ].join(', '),
  ).remove()
}

function removeChrome($: CheerioAPI): void {
  $(
    [
      'nav',
      'footer',
      'aside',
      'header',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[role="complementary"]',
      '.nav',
      '.navbar',
      '.sidebar',
      '.footer',
      '#cookie-banner',
      '.cookie-banner',
    ].join(', '),
  ).remove()
}

function candidateFromSelector(
  $: CheerioAPI,
  selector: string,
): string | null {
  const el = $(selector).first()
  if (!el.length) return null
  if (visibleTextLength(el.text()) < MIN_MAIN_CONTENT_CHARS) return null
  const html = $.html(el)?.trim()
  return html || null
}

/**
 * Prefer article/main regions; otherwise body with chrome removed.
 * Returns an HTML fragment suitable for Turndown.
 */
export function selectMainContentHtml($: CheerioAPI): string {
  pruneScrapeDom($)

  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '#content',
    '#main',
    '#main-content',
    '.post-content',
    '.article-body',
    '.entry-content',
    '.markdown-body',
  ]

  for (const selector of selectors) {
    const html = candidateFromSelector($, selector)
    if (html) return html
  }

  removeChrome($)
  const body = $('body')
  if (body.length > 0) {
    const html = $.html(body)?.trim()
    if (html) return html
  }
  return $.html($.root())?.trim() || ''
}

function applyMaxChars(value: string, maxChars?: number): {
  value: string
  truncated: boolean
} {
  if (maxChars == null || value.length <= maxChars) {
    return { value, truncated: false }
  }
  return { value: value.slice(0, maxChars), truncated: true }
}

/**
 * Prune → main content → markdown → optional char cap.
 * Default cap: {@link DEFAULT_WEB_SCRAPE_MARKDOWN_MAX_CHARS}.
 */
export function extractPageContent(
  $: CheerioAPI,
  options?: { maxChars?: number },
): PageExtractResult {
  const title = $('title').first().text().replace(/\s+/g, ' ').trim()
  const fragment = selectMainContentHtml($)
  const markdown = htmlToMarkdown(fragment, title || undefined)
  const maxChars = options?.maxChars ?? DEFAULT_WEB_SCRAPE_MARKDOWN_MAX_CHARS
  const capped = applyMaxChars(markdown, maxChars)
  return {
    title,
    markdown: capped.value,
    truncated: capped.truncated,
  }
}

/** Flat text extract (scripts pruned). Prefer {@link extractPageContent}. */
export function extractPageText(
  $: CheerioAPI,
  options?: { maxChars?: number },
): { title: string; text: string; truncated: boolean } {
  const title = $('title').first().text().replace(/\s+/g, ' ').trim()
  pruneScrapeDom($)
  removeChrome($)
  const body = $('body')
  const raw =
    body.length > 0
      ? body.text().replace(/\s+/g, ' ').trim()
      : $.root().text().replace(/\s+/g, ' ').trim()
  const textResult = applyMaxChars(
    raw,
    options?.maxChars ?? DEFAULT_WEB_SCRAPE_MARKDOWN_MAX_CHARS,
  )
  return { title, text: textResult.value, truncated: textResult.truncated }
}

type CrawlAttempt = {
  spec: SearchCrawlRequest
  playwrightOptions: SearchCrawlerRunOptions
}

function asSearchCrawlEngineAdapter(
  engine: ReturnType<typeof defaultSearchEngineRegistry.get>,
  query: string,
  maxResults: number,
): SearchCrawlEngineAdapter {
  return {
    getCrawlModes: () => engine.getCrawlModes(),
    getPlaywrightRunOptions: () => engine.getPlaywrightRunOptions(),
    getPlaywrightFallbackRunOptions: (fallback) =>
      engine.getPlaywrightFallbackRunOptions(fallback),
    buildFallbackCrawlRequest: () =>
      engine.buildFallbackCrawlRequest(query, maxResults),
    isAccessBlocked: (html, requestUrl) =>
      engine.isAccessBlocked(html, requestUrl),
    parseResults: ($, max, context) => engine.parseResults($, max, context),
    emptyResultsMessage: (requestUrl) =>
      engine.emptyResultsMessage(requestUrl),
    shouldSkipPlaywrightAfterCheerioBlock: () =>
      engine.shouldSkipPlaywrightAfterCheerioBlock(),
  }
}

export async function searchWithEngine(
  engineId: SearchEngineId,
  query: string,
  maxResults: number,
  handlers: SearchCrawlerHandlerRegistry = defaultSearchCrawlerHandlers,
): Promise<{
  results: WebSearchResult[]
  searchUrl: string
  error?: string
}> {
  const engine = defaultSearchEngineRegistry.get(engineId)
  const crawlSpec = engine.buildCrawlRequest(query, maxResults)
  const searchUrl = crawlSpec.label ?? crawlSpec.url

  const { results, error } = await runSearchCrawlLoop(
    asSearchCrawlEngineAdapter(engine, query, maxResults),
    crawlSpec,
    maxResults,
    handlers,
  )

  return {
    results,
    searchUrl,
    error,
  }
}

/** Search with a single crawl mode (for tests and diagnostics). */
export async function searchWithEngineMode(
  engineId: SearchEngineId,
  query: string,
  maxResults: number,
  mode: SearchCrawlMode,
  handlers: SearchCrawlerHandlerRegistry = defaultSearchCrawlerHandlers,
): Promise<{
  results: WebSearchResult[]
  searchUrl: string
  mode: SearchCrawlMode
  error?: string
}> {
  const engine = defaultSearchEngineRegistry.get(engineId)
  const crawlSpec = engine.buildCrawlRequest(query, maxResults)
  const searchUrl = crawlSpec.label ?? crawlSpec.url
  const results: WebSearchResult[] = []
  let loadError: string | undefined

  const ingestPage = async (
    $: CheerioAPI,
    requestUrl: string,
    html?: string,
  ) => {
    if (html && engine.isAccessBlocked(html, requestUrl)) {
      loadError = engine.emptyResultsMessage(requestUrl)
      return
    }
    const parsed = engine.parseResults($, maxResults, { requestUrl })
    if (parsed.length === 0) {
      loadError = engine.emptyResultsMessage(requestUrl)
      return
    }
    results.push(...parsed)
    loadError = undefined
  }

  const crawlAttempts: CrawlAttempt[] = [
    {
      spec: crawlSpec,
      playwrightOptions: engine.getPlaywrightRunOptions(),
    },
  ]
  const fallback = engine.buildFallbackCrawlRequest(query, maxResults)
  if (fallback) {
    crawlAttempts.push({
      spec: fallback,
      playwrightOptions: engine.getPlaywrightFallbackRunOptions(fallback),
    })
  }

  try {
    for (const attempt of crawlAttempts) {
      if (results.length > 0) break
      try {
        const handler = handlers.get(mode)
        const runOptions =
          mode === 'playwright' ? attempt.playwrightOptions : undefined
        const page = await handler.fetch(attempt.spec, runOptions)
        if (
          mode === 'cheerio' &&
          engine.isAccessBlocked(page.html, page.requestUrl)
        ) {
          loadError = engine.emptyResultsMessage(page.requestUrl)
          continue
        }
        await ingestPage(page.$, page.requestUrl, page.html)
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e)
      }
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

  return {
    results,
    searchUrl,
    mode,
    error: results.length === 0 ? loadError : undefined,
  }
}

export async function cascadeWebSearch(
  query: string,
  maxResults: number,
  engines?: SearchEngineId[],
): Promise<
  | {
      success: true
      engine: SearchEngineId
      searchUrl: string
      resultCount: number
      results: WebSearchResult[]
      attempts: SearchEngineAttempt[]
    }
  | {
      success: false
      error: string
      query: string
      attempts: SearchEngineAttempt[]
    }
> {
  const order = defaultSearchEngineRegistry.resolveOrder(engines)
  const attempts: SearchEngineAttempt[] = []

  for (const engineId of order) {
    const attempt = await searchWithEngine(engineId, query, maxResults)
    const succeeded = attempt.results.length > 0

    attempts.push({
      engine: engineId,
      success: succeeded,
      searchUrl: attempt.searchUrl,
      resultCount: attempt.results.length,
      error: succeeded ? undefined : attempt.error,
    })

    if (succeeded) {
      return {
        success: true,
        engine: engineId,
        searchUrl: attempt.searchUrl,
        resultCount: attempt.results.length,
        results: attempt.results,
        attempts,
      }
    }
  }

  return {
    success: false,
    error: `All search engines failed for "${query}" (${order.join(' → ')}). Last error: ${attempts.at(-1)?.error ?? 'no results parsed'}`,
    query,
    attempts,
  }
}

async function withEphemeralCrawler<T>(
  run: (config: Configuration) => Promise<T>,
): Promise<T> {
  const storageDir = await mkdtemp(join(tmpdir(), 'teralexi-crawlee-'))
  const config = createEphemeralCrawleeConfig(storageDir)
  try {
    return await run(config)
  } finally {
    await rm(storageDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const webSearch: SkillTool = {
  name: 'web_search',
  tags: ['web'],
  description:
    'Search the public web (Cheerio and Playwright). Tries DuckDuckGo, Bing, Google, Yandex, then Startpage until results are found. Each engine is attempted with Cheerio first, then Playwright. Returns titles, URLs, snippets, which engine succeeded, and per-engine attempt notes. Optional `engines` overrides order. No API keys.',
  inputSchema: webSearchInput,
  needsApproval: false,
  async execute(input) {
    const parsed = webSearchInput.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() }
    }

    const { query, maxResults, engines } = parsed.data

    try {
      const outcome = await cascadeWebSearch(query, maxResults, engines)
      if (!outcome.success) {
        return outcome
      }

      return {
        success: true,
        query,
        searchUrl: outcome.searchUrl,
        engine: outcome.engine,
        resultCount: outcome.resultCount,
        results: outcome.results,
        attempts: outcome.attempts,
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        query,
      }
    }
  },
}

export type ScrapedPage = {
  url: string
  loadedUrl?: string
  title: string
  /** Main-content markdown for the LLM. */
  markdown: string
  truncated: boolean
  /** Which fetch path produced this page (`playwright` only when used as fallback). */
  fetchMode: SearchCrawlMode
}

export type ScrapePageOptions = {
  maxChars?: number
}

const MIN_SCRAPE_CONTENT_CHARS = 80

/** True when HTML is a JS-required shell with little usable text. */
export function isJsShellHtml(html: string): boolean {
  return (
    /enablejs|httpservice\/retry\/enablejs/i.test(html) ||
    /please enable javascript|javascript is disabled/i.test(html)
  )
}

/** True when scraped markdown (or legacy HTML) has too little readable content. */
export function isScrapeMarkdownInsufficient(
  markdown: string,
  minChars = MIN_SCRAPE_CONTENT_CHARS,
): boolean {
  return (
    markdown
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#>*`_\-[\]()|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim().length < minChars
  )
}

/** @deprecated Use {@link isScrapeMarkdownInsufficient}. */
export function isScrapeHtmlInsufficient(
  html: string,
  minChars = MIN_SCRAPE_CONTENT_CHARS,
): boolean {
  return isScrapeMarkdownInsufficient(html, minChars)
}

/** @deprecated Use {@link isScrapeMarkdownInsufficient}. */
export function isScrapeTextInsufficient(
  text: string,
  minChars = MIN_SCRAPE_CONTENT_CHARS,
): boolean {
  return text.replace(/\s+/g, ' ').trim().length < minChars
}

/** @deprecated Use {@link isScrapeMarkdownInsufficient}. */
export function isScrapeContentInsufficient(
  _text: string,
  html: string | null | undefined,
  minChars = MIN_SCRAPE_CONTENT_CHARS,
): boolean {
  return isScrapeMarkdownInsufficient(html ?? '', minChars)
}

async function scrapeUrlWithCheerio(
  url: string,
  options?: ScrapePageOptions,
): Promise<ScrapedPage | null> {
  let scraped: ScrapedPage | null = null

  await withEphemeralCrawler(async (config) => {
    const crawler = new CheerioCrawler(
      {
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1,
        requestHandlerTimeoutSecs: CRAWLER_TIMEOUT_SECS,
        navigationTimeoutSecs: CRAWLER_TIMEOUT_SECS,
        preNavigationHooks: crawlerPreNavigationHooks,
        async requestHandler({ $, request }) {
          const html = $.html()
          if (isJsShellHtml(html)) return

          const extracted = extractPageContent($, {
            maxChars: options?.maxChars,
          })
          if (isScrapeMarkdownInsufficient(extracted.markdown)) {
            return
          }

          scraped = {
            url: request.url,
            loadedUrl: request.loadedUrl,
            title: extracted.title,
            markdown: extracted.markdown,
            truncated: extracted.truncated,
            fetchMode: 'cheerio',
          }
        },
      },
      config,
    )
    await crawler.run([url])
  })

  return scraped
}

async function scrapeUrlWithPlaywright(
  url: string,
  options?: ScrapePageOptions,
  handlers: SearchCrawlerHandlerRegistry = defaultSearchCrawlerHandlers,
): Promise<ScrapedPage | null> {
  const spec: SearchCrawlRequest = { url, method: 'GET', label: url }
  const payload = await handlers.playwright.fetch(spec, { waitSelector: 'html' })

  if (isJsShellHtml(payload.html)) return null

  const extracted = extractPageContent(payload.$, {
    maxChars: options?.maxChars,
  })
  if (isScrapeMarkdownInsufficient(extracted.markdown)) {
    return null
  }

  return {
    url,
    loadedUrl: payload.requestUrl,
    title: extracted.title,
    markdown: extracted.markdown,
    truncated: extracted.truncated,
    fetchMode: 'playwright',
  }
}

/** Scrape one URL: Cheerio first, then Playwright when content is missing or JS-only. */
export async function scrapePage(
  url: string,
  options?: ScrapePageOptions,
  handlers: SearchCrawlerHandlerRegistry = defaultSearchCrawlerHandlers,
): Promise<ScrapedPage> {
  let cheerioError: string | undefined
  const scrapeOpts: ScrapePageOptions = {
    maxChars: options?.maxChars ?? DEFAULT_WEB_SCRAPE_MARKDOWN_MAX_CHARS,
  }

  try {
    const cheerioPage = await scrapeUrlWithCheerio(url, scrapeOpts)
    if (cheerioPage) return cheerioPage
  } catch (e) {
    cheerioError = e instanceof Error ? e.message : String(e)
  }

  try {
    const playwrightPage = await scrapeUrlWithPlaywright(
      url,
      scrapeOpts,
      handlers,
    )
    if (playwrightPage) return playwrightPage
  } catch (e) {
    const playwrightError = e instanceof Error ? e.message : String(e)
    throw new Error(
      playwrightError +
        (cheerioError ? ` (Cheerio: ${cheerioError})` : ''),
    )
  }

  throw new Error(
    cheerioError ??
      `Could not extract enough content from ${url} via Cheerio or Playwright.`,
  )
}

export const webScrape: SkillTool = {
  name: 'web_scrape',
  tags: ['web'],
  description:
    'Fetch public pages and return each page as `title` plus main-content `markdown` (scripts/chrome stripped; article/main preferred; HTML→Markdown for the LLM). Cheerio first; Playwright fallback for empty/JS-only pages. Pass `url` or `urls`. Optional `maxChars` caps markdown length (default 12000).',
  inputSchema: webScrapeInput,
  needsApproval: false,
  async execute(input) {
    const parsed = webScrapeInput.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() }
    }

    const { url, urls, maxChars } = parsed.data
    const targetUrls = [...(urls ?? []), ...(url ? [url] : [])]
    if (targetUrls.length === 0) {
      return {
        success: false,
        error: 'Provide `url` or a non-empty `urls` array.',
      }
    }

    try {
      const pages: ScrapedPage[] = []
      const errors: string[] = []

      for (const targetUrl of targetUrls) {
        try {
          pages.push(
            await scrapePage(targetUrl, {
              maxChars: maxChars ?? DEFAULT_WEB_SCRAPE_MARKDOWN_MAX_CHARS,
            }),
          )
        } catch (e) {
          errors.push(
            `${targetUrl}: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      }

      if (pages.length === 0) {
        return {
          success: false,
          error:
            errors.join('; ') ||
            'No pages were scraped. URLs may be unreachable or blocked.',
          urls: targetUrls,
        }
      }

      return {
        success: true,
        pageCount: pages.length,
        pages,
        ...(errors.length > 0 ? { partialErrors: errors } : {}),
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        urls: targetUrls,
      }
    }
  },
}
