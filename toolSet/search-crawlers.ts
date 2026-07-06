import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LogLevel } from '@apify/log'
import { CheerioCrawler, Configuration, Request } from 'crawlee'
import type { CheerioAPI } from 'cheerio'
import * as cheerio from 'cheerio'
import type { Browser } from 'playwright-core'
import { chromium } from 'playwright-core'
import type {
  SearchCrawlMode,
  SearchCrawlRequest,
  SearchCrawlerRunOptions,
} from './web-search-engines'
import { SEARCH_CRAWLER_USER_AGENT } from './web-search-engines'

export type { SearchCrawlerRunOptions } from './web-search-engines'

export type SearchPagePayload = {
  $: CheerioAPI
  requestUrl: string
  html: string
}

const DEFAULT_FETCH_TIMEOUT_MS = 30_000

async function withFetchTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Search fetch timed out after ${timeoutMs}ms (${label})`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Shared settings for {@link CheerioSearchHandler}. */
export class CheerioCrawlerConfig {
  constructor(
    readonly userAgent: string = SEARCH_CRAWLER_USER_AGENT,
    readonly timeoutSecs: number = 25,
    readonly acceptLanguage: string = 'en-US,en;q=0.9',
    readonly fetchTimeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {}

  readonly accept =
    'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' as const
}

/** Shared settings for {@link PlaywrightSearchHandler}. */
export class PlaywrightCrawlerConfig {
  constructor(
    readonly userAgent: string = SEARCH_CRAWLER_USER_AGENT,
    readonly timeoutSecs: number = 25,
    readonly headless: boolean = true,
    readonly locale: string = 'en-US',
    readonly viewport = { width: 1280, height: 720 },
    readonly consentSelectors: string =
      '#L2AGLb, button:has-text("Accept all"), button:has-text("I agree")',
    readonly resultWaitTimeoutMs: number = 12_000,
    readonly fetchTimeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {}
}

export abstract class SearchCrawlerHandler {
  abstract readonly mode: SearchCrawlMode

  abstract fetch(
    spec: SearchCrawlRequest,
    options?: SearchCrawlerRunOptions,
  ): Promise<SearchPagePayload>
}

function createEphemeralCrawleeConfig(storageDir: string): Configuration {
  return new Configuration({
    persistStorage: true,
    purgeOnStart: true,
    logLevel: LogLevel.WARNING,
    storageClientOptions: { storageDir },
  })
}

/** Launch Chromium for Playwright — stealth binary first, then bundled/system Chrome. */
export async function launchSearchChromium(
  config: PlaywrightCrawlerConfig,
): Promise<Browser> {
  try {
    const { launch } = await import('cloakbrowser')
    return await launch({
      headless: config.headless,
      locale: config.locale,
      humanize: true,
      launchOptions: { timeout: config.timeoutSecs * 1000 },
    })
  } catch {
    /* fall through to playwright-core */
  }

  const launchOptions = {
    headless: config.headless,
    timeout: config.timeoutSecs * 1000,
  }

  try {
    return await chromium.launch(launchOptions)
  } catch {
    try {
      return await chromium.launch({ ...launchOptions, channel: 'chrome' })
    } catch {
      return await chromium.launch({ ...launchOptions, channel: 'msedge' })
    }
  }
}

function toCrawleeRequest(spec: SearchCrawlRequest): Request {
  return new Request({
    url: spec.url,
    method: spec.method ?? 'GET',
    payload: spec.payload,
    headers: spec.headers,
    useExtendedUniqueKey: spec.method === 'POST',
  })
}

/** Fetches SERPs with Crawlee {@link CheerioCrawler} (static HTML). */
export class CheerioSearchHandler extends SearchCrawlerHandler {
  readonly mode = 'cheerio' as const

  constructor(private readonly config: CheerioCrawlerConfig) {
    super()
  }

  async fetch(
    spec: SearchCrawlRequest,
    _options?: SearchCrawlerRunOptions,
  ): Promise<SearchPagePayload> {
    return withFetchTimeout(
      this.fetchInner(spec),
      `cheerio:${spec.url}`,
      this.config.fetchTimeoutMs,
    )
  }

  private async fetchInner(spec: SearchCrawlRequest): Promise<SearchPagePayload> {
    const storageDir = await mkdtemp(join(tmpdir(), 'teralexi-cheerio-'))
    const crawleeConfig = createEphemeralCrawleeConfig(storageDir)
    let payload!: SearchPagePayload

    try {
      const crawler = new CheerioCrawler(
        {
          maxRequestsPerCrawl: 1,
          maxConcurrency: 1,
          requestHandlerTimeoutSecs: this.config.timeoutSecs,
          navigationTimeoutSecs: this.config.timeoutSecs,
          preNavigationHooks: [
            ({ request }) => {
              request.headers = {
                ...request.headers,
                'User-Agent': this.config.userAgent,
                Accept: this.config.accept,
                'Accept-Language': this.config.acceptLanguage,
                ...spec.headers,
              }
            },
          ],
          async requestHandler({ $, request }) {
            const requestUrl = request.loadedUrl ?? request.url
            payload = {
              $,
              requestUrl,
              html: $.html(),
            }
          },
        },
        crawleeConfig,
      )
      await crawler.run([toCrawleeRequest(spec)])
    } finally {
      await rm(storageDir, { recursive: true, force: true }).catch(() => undefined)
    }

    if (!payload) {
      throw new Error(`Cheerio crawler did not load ${spec.url}`)
    }
    return payload
  }
}

/** Fetches SERPs with headless Chromium via playwright-core. */
export class PlaywrightSearchHandler extends SearchCrawlerHandler {
  readonly mode = 'playwright' as const

  constructor(private readonly config: PlaywrightCrawlerConfig) {
    super()
  }

  async fetch(
    spec: SearchCrawlRequest,
    options?: SearchCrawlerRunOptions,
  ): Promise<SearchPagePayload> {
    return withFetchTimeout(
      this.fetchInner(spec, options),
      `playwright:${spec.url}`,
      this.config.fetchTimeoutMs,
    )
  }

  private async fetchInner(
    spec: SearchCrawlRequest,
    options?: SearchCrawlerRunOptions,
  ): Promise<SearchPagePayload> {
    const browser = await launchSearchChromium(this.config)
    try {
      const page = await browser.newPage({
        userAgent: this.config.userAgent,
        locale: this.config.locale,
        viewport: this.config.viewport,
        extraHTTPHeaders: spec.headers,
      })
      page.setDefaultTimeout(this.config.timeoutSecs * 1000)

      if (spec.method === 'POST' && spec.payload) {
        const response = await page.context().request.post(spec.url, {
          data: spec.payload,
          timeout: this.config.timeoutSecs * 1000,
          headers: {
            ...spec.headers,
            'Content-Type':
              spec.headers?.['Content-Type'] ??
              'application/x-www-form-urlencoded',
            'User-Agent': this.config.userAgent,
          },
        })
        const html = await response.text()
        const requestUrl = response.url()
        return { $: cheerio.load(html), requestUrl, html }
      }

      await page.goto(spec.url, {
        waitUntil: 'networkidle',
        timeout: this.config.timeoutSecs * 1000,
      })

      await page
        .locator(this.config.consentSelectors)
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined)

      const waitSelector = options?.waitSelector
      if (waitSelector) {
        try {
          await page.waitForSelector(waitSelector, {
            timeout: this.config.resultWaitTimeoutMs,
          })
        } catch {
          /* blocked, slow, or layout change */
        }
      }

      const html = await page.content()
      const requestUrl = page.url()
      return { $: cheerio.load(html), requestUrl, html }
    } finally {
      await browser.close()
    }
  }
}

/** Resolves Cheerio / Playwright handlers by crawl mode. */
export class SearchCrawlerHandlerRegistry {
  constructor(
    readonly cheerio: CheerioSearchHandler,
    readonly playwright: PlaywrightSearchHandler,
  ) {}

  get(mode: SearchCrawlMode): SearchCrawlerHandler {
    return mode === 'cheerio' ? this.cheerio : this.playwright
  }

  static createDefault(): SearchCrawlerHandlerRegistry {
    return new SearchCrawlerHandlerRegistry(
      new CheerioSearchHandler(new CheerioCrawlerConfig()),
      new PlaywrightSearchHandler(new PlaywrightCrawlerConfig()),
    )
  }
}

export const defaultSearchCrawlerHandlers =
  SearchCrawlerHandlerRegistry.createDefault()
