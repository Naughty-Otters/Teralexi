var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// toolSet/google-scholar-search.ts
var google_scholar_search_exports = {};
__export(google_scholar_search_exports, {
  GoogleScholarSearchEngine: () => GoogleScholarSearchEngine,
  SEARCH_CRAWLER_USER_AGENT: () => SEARCH_CRAWLER_USER_AGENT,
  decodeScholarResultUrl: () => decodeScholarResultUrl,
  googleScholarSearchEngine: () => googleScholarSearchEngine,
  isScholarAccessBlocked: () => isScholarAccessBlocked,
  parseScholarHtmlResults: () => parseScholarHtmlResults,
  searchGoogleScholar: () => searchGoogleScholar
});
module.exports = __toCommonJS(google_scholar_search_exports);

// toolSet/search-crawlers.ts
var import_promises = require("node:fs/promises");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var import_log = require("@apify/log");
var import_crawlee = require("crawlee");
var cheerio = __toESM(require("cheerio"));

// toolSet/web-search-engines.ts
var import_zod = require("zod");
var searchEngineId = import_zod.z.enum([
  "duckduckgo",
  "bing",
  "google",
  "yandex",
  "startpage"
]);
var DEFAULT_SEARCH_ENGINE_ORDER = [
  "duckduckgo",
  "bing",
  "google",
  "yandex",
  "startpage"
];
var SEARCH_CRAWLER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
function collapseText(value) {
  return value.replace(/\s+/g, " ").trim();
}
function decodeDuckDuckGoResultUrl(href) {
  const normalized = href.startsWith("//") ? `https:${href}` : href;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.includes("duckduckgo.com") && parsed.pathname.startsWith("/l/")) {
      const target = parsed.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
  } catch {
  }
  return normalized;
}
function decodeYandexResultUrl(href) {
  const normalized = href.startsWith("//") ? `https:${href}` : href;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.includes("yandex.")) {
      const direct = parsed.searchParams.get("url") ?? parsed.searchParams.get("u") ?? parsed.searchParams.get("to");
      if (direct) return decodeURIComponent(direct);
    }
  } catch {
  }
  return normalized;
}
function decodeGoogleResultUrl(href) {
  try {
    const base = href.startsWith("http") ? href : `https://www.google.com${href.startsWith("/") ? href : `/${href}`}`;
    const parsed = new URL(base);
    if (parsed.hostname.includes("google.") && (parsed.pathname === "/url" || parsed.pathname.startsWith("/url"))) {
      const target = parsed.searchParams.get("q");
      if (target) return decodeURIComponent(target);
    }
  } catch {
  }
  return href;
}
var SearchEngine = class {
  constructor(config) {
    this.config = config;
  }
  get id() {
    return this.config.id;
  }
  /** Override when the provider requires POST or extra headers (e.g. DuckDuckGo HTML). */
  buildCrawlRequest(query, maxResults) {
    const url = this.buildSearchUrl(query, maxResults);
    return { url, method: "GET", label: url };
  }
  /** Crawl modes to try, in order, until results are parsed. */
  getCrawlModes() {
    return ["cheerio", "playwright"];
  }
  /** Playwright-only options for the primary crawl request. */
  getPlaywrightRunOptions() {
    return { waitSelector: this.getPlaywrightWaitSelector() };
  }
  /** Playwright-only options for a fallback crawl request (e.g. Startpage). */
  getPlaywrightFallbackRunOptions(fallback) {
    if (fallback.url.includes("startpage.com")) {
      return { waitSelector: '.result h2, .result a[href^="http"]' };
    }
    return this.getPlaywrightRunOptions();
  }
  /** Optional selector to wait for after navigation in Playwright mode. */
  getPlaywrightWaitSelector() {
    return void 0;
  }
  /** Whether the fetched page indicates a block/CAPTCHA instead of results. */
  isAccessBlocked(html, requestUrl) {
    return false;
  }
  /** Optional Cheerio fallback when the primary crawl yields no parseable rows. */
  buildFallbackCrawlRequest(_query, _maxResults) {
    return void 0;
  }
  /** Override when result links need provider-specific decoding. */
  decodeResultUrl(href) {
    return href;
  }
  emptyResultsMessage(requestUrl) {
    return `No ${this.config.id} results parsed from ${requestUrl}. The page layout may have changed or access was blocked.`;
  }
  /**
   * When true, a Cheerio CAPTCHA/block skips Playwright for the same crawl spec.
   * Most engines still benefit from Playwright after Cheerio fails (e.g. Yandex).
   */
  shouldSkipPlaywrightAfterCheerioBlock() {
    return false;
  }
};
var DuckDuckGoSearchEngine = class _DuckDuckGoSearchEngine extends SearchEngine {
  static {
    this.htmlEndpoint = "https://html.duckduckgo.com/html/";
  }
  static {
    this.configuration = {
      id: "duckduckgo",
      displayName: "DuckDuckGo",
      selectors: {
        resultRow: ".result.results_links",
        titleLink: "a.result__a",
        snippet: ".result__snippet"
      }
    };
  }
  constructor() {
    super(_DuckDuckGoSearchEngine.configuration);
  }
  getPlaywrightWaitSelector() {
    return ".result.results_links, a.result__a";
  }
  isAccessBlocked(html, requestUrl) {
    return /captcha|challenge|anomaly-modal|bots use duckduckgo/i.test(html);
  }
  buildSearchUrl(query, _maxResults) {
    const url = new URL(_DuckDuckGoSearchEngine.htmlEndpoint);
    url.searchParams.set("q", query.trim());
    return url.toString();
  }
  buildCrawlRequest(query, maxResults) {
    const body = new URLSearchParams();
    body.set("q", query.trim());
    body.set("b", "");
    return {
      url: _DuckDuckGoSearchEngine.htmlEndpoint,
      method: "POST",
      payload: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://html.duckduckgo.com",
        Referer: "https://html.duckduckgo.com/"
      },
      label: this.buildSearchUrl(query, maxResults)
    };
  }
  /** GET HTML search when POST returns a CAPTCHA or empty body. */
  buildFallbackCrawlRequest(query, maxResults) {
    const url = new URL(_DuckDuckGoSearchEngine.htmlEndpoint);
    url.searchParams.set("q", query.trim());
    return {
      url: url.toString(),
      method: "GET",
      label: this.buildSearchUrl(query, maxResults)
    };
  }
  decodeResultUrl(href) {
    return decodeDuckDuckGoResultUrl(href);
  }
  extractTitle(row, link) {
    return collapseText(link.text()) || collapseText(row.find(".result__title").first().text()) || collapseText(row.find("h2").first().text());
  }
  parseResults($, maxResults, _context) {
    const { resultRow, titleLink, snippet } = this.config.selectors;
    const results = [];
    const seenUrls = /* @__PURE__ */ new Set();
    const rows = $(resultRow).length > 0 ? $(resultRow) : $(".result.web-result, .result");
    rows.each((_, element) => {
      if (results.length >= maxResults) return false;
      const row = $(element);
      const link = row.find(titleLink).first();
      const href = link.attr("href")?.trim();
      const title = this.extractTitle(row, link);
      if (!href || !title) return;
      const url = this.decodeResultUrl(href);
      if (!url.startsWith("http") || seenUrls.has(url)) return;
      seenUrls.add(url);
      results.push({
        title,
        url,
        snippet: collapseText(row.find(snippet).text())
      });
    });
    return results;
  }
};
var BingSearchEngine = class _BingSearchEngine extends SearchEngine {
  static {
    this.configuration = {
      id: "bing",
      displayName: "Bing",
      selectors: {
        resultRow: "li.b_algo",
        titleLink: "h2 a",
        snippet: ".b_caption p, .b_algoSlug, .b_lineclamp2, .b_snippet"
      }
    };
  }
  constructor() {
    super(_BingSearchEngine.configuration);
  }
  getPlaywrightWaitSelector() {
    return "li.b_algo, #b_results";
  }
  findTitleLink(row, $) {
    const { titleLink } = this.config.selectors;
    const h2Link = row.find(titleLink).first();
    if (h2Link.attr("href") && collapseText(h2Link.text())) return h2Link;
    let best;
    let bestLen = 0;
    row.find("a[href]").each((_, anchor) => {
      const link = $(anchor);
      const href = link.attr("href")?.trim() ?? "";
      const title = collapseText(link.text());
      if (!href.startsWith("http")) return;
      if (title.length < 8 || title.includes("\u203A")) return;
      if (title.length > bestLen) {
        best = link;
        bestLen = title.length;
      }
    });
    return best ?? row.find('a[href^="http"]').first();
  }
  buildSearchUrl(query, maxResults) {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("count", String(Math.min(maxResults, 50)));
    return url.toString();
  }
  parseResults($, maxResults, _context) {
    const { resultRow, titleLink, snippet } = this.config.selectors;
    const results = [];
    $(resultRow).each((_, element) => {
      if (results.length >= maxResults) return false;
      const row = $(element);
      const link = this.findTitleLink(row, $);
      const href = link.attr("href")?.trim();
      const title = collapseText(link.text());
      if (!href || !title || !href.startsWith("http")) return;
      results.push({
        title,
        url: href,
        snippet: collapseText(row.find(snippet).first().text())
      });
    });
    return results;
  }
};
function buildStartpageSearchUrl(query) {
  const url = new URL("https://www.startpage.com/sp/search");
  url.searchParams.set("query", query.trim());
  url.searchParams.set("language", "english");
  return url.toString();
}
function parseStartpageHtmlResults($, maxResults) {
  const results = [];
  const seenUrls = /* @__PURE__ */ new Set();
  $(".result").each((_, element) => {
    if (results.length >= maxResults) return false;
    const row = $(element);
    const link = row.find('a[href^="http"]').first();
    const href = link.attr("href")?.trim();
    const title = collapseText(row.find("h2").first().text()) || collapseText(link.text());
    if (!href || !title || title.length < 3) return;
    if (seenUrls.has(href)) return;
    seenUrls.add(href);
    const snippet = collapseText(
      row.find("p").filter((_2, p) => collapseText($(p).text()).length > 20).first().text()
    );
    results.push({ title, url: href, snippet });
  });
  return results;
}
function isGoogleAccessBlocked(html, requestUrl) {
  if (/google\.com\/sorry|\/sorry\/index/i.test(requestUrl)) return true;
  return /unusual traffic|recaptcha|detected unusual traffic/i.test(html) || /enablejs|httpservice\/retry\/enablejs/i.test(html) || /SG_REL|trouble accessing Google Search/i.test(html);
}
var GoogleSearchEngine = class _GoogleSearchEngine extends SearchEngine {
  static {
    this.configuration = {
      id: "google",
      displayName: "Google",
      selectors: {
        resultRow: "motion.div.g, div.g",
        titleLink: "h3",
        snippet: ".VwiC3b, .st, .IsZvec, .hiQRQb, [data-sncf]"
      }
    };
  }
  constructor() {
    super(_GoogleSearchEngine.configuration);
  }
  getPlaywrightWaitSelector() {
    return "motion.div.g h3, div.g h3";
  }
  isAccessBlocked(html, requestUrl) {
    return isGoogleAccessBlocked(html, requestUrl);
  }
  buildSearchUrl(query, maxResults) {
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("hl", "en");
    url.searchParams.set("num", String(Math.min(maxResults, 10)));
    return url.toString();
  }
  buildFallbackCrawlRequest(query, maxResults) {
    const url = buildStartpageSearchUrl(query);
    return {
      url,
      method: "GET",
      label: this.buildSearchUrl(query, maxResults)
    };
  }
  decodeResultUrl(href) {
    return decodeGoogleResultUrl(href);
  }
  parseResults($, maxResults, context) {
    if (context?.requestUrl?.includes("startpage.com")) {
      return parseStartpageHtmlResults($, maxResults);
    }
    return this.parseGoogleOrganicResults($, maxResults);
  }
  parseGoogleOrganicResults($, maxResults) {
    const { resultRow, snippet } = this.config.selectors;
    const results = [];
    const seenUrls = /* @__PURE__ */ new Set();
    $(resultRow).each((_, element) => {
      if (results.length >= maxResults) return false;
      const block = $(element);
      const heading = block.find("h3").first();
      const anchor = heading.length ? heading.closest("a") : block.find("a:has(h3)").first();
      const href = anchor.attr("href")?.trim();
      const title = collapseText(heading.text());
      if (!href || !title) return;
      const url = this.decodeResultUrl(href);
      if (!url.startsWith("http") || seenUrls.has(url)) return;
      seenUrls.add(url);
      results.push({
        title,
        url,
        snippet: collapseText(block.find(snippet).first().text())
      });
    });
    return results;
  }
  emptyResultsMessage(requestUrl) {
    if (requestUrl.includes("startpage.com")) {
      return `No Google results parsed from Startpage fallback (${requestUrl}).`;
    }
    if (isGoogleAccessBlocked("", requestUrl)) {
      return "Google blocked automated access (CAPTCHA / sorry page).";
    }
    return `No Google results parsed from ${requestUrl}. The page layout may have changed or access was blocked.`;
  }
};
function isYandexAccessBlocked(html, requestUrl) {
  if (/showcaptcha|showcaptchafast/i.test(requestUrl)) return true;
  return /showcaptcha|SmartCaptcha|not a robot/i.test(html);
}
var StartpageSearchEngine = class _StartpageSearchEngine extends SearchEngine {
  static {
    this.configuration = {
      id: "startpage",
      displayName: "Startpage",
      selectors: {
        resultRow: ".result",
        titleLink: 'h2, a[href^="http"]',
        snippet: "p"
      }
    };
  }
  constructor() {
    super(_StartpageSearchEngine.configuration);
  }
  getPlaywrightWaitSelector() {
    return '.result h2, .result a[href^="http"]';
  }
  buildSearchUrl(query, _maxResults) {
    return buildStartpageSearchUrl(query);
  }
  parseResults($, maxResults, _context) {
    return parseStartpageHtmlResults($, maxResults);
  }
};
var YandexSearchEngine = class _YandexSearchEngine extends SearchEngine {
  static {
    this.configuration = {
      id: "yandex",
      displayName: "Yandex",
      selectors: {
        resultRow: "li.serp-item",
        titleLink: "a.b-serp-item__title-link, a.OrganicTitle-Link, h2.Organic-Title a",
        snippet: ".b-serp-item__text, .OrganicText, .Organic-Description, .ExtendedText"
      }
    };
  }
  constructor() {
    super(_YandexSearchEngine.configuration);
  }
  getPlaywrightWaitSelector() {
    return "li.serp-item, a.OrganicTitle-Link";
  }
  isAccessBlocked(html, requestUrl) {
    return isYandexAccessBlocked(html, requestUrl);
  }
  buildSearchUrl(query, _maxResults) {
    const url = new URL("https://yandex.com/search/");
    url.searchParams.set("text", query.trim());
    url.searchParams.set("lr", "84");
    url.searchParams.set("lang", "en");
    return url.toString();
  }
  decodeResultUrl(href) {
    return decodeYandexResultUrl(href);
  }
  emptyResultsMessage(requestUrl) {
    return `No yandex results parsed from ${requestUrl}. Yandex may have shown a CAPTCHA or blocked automated access.`;
  }
  extractTitle(row, link) {
    return collapseText(link.text()) || collapseText(row.find("h2, h3").first().text()) || collapseText(row.find(".OrganicTitle").first().text());
  }
  parseResults($, maxResults, _context) {
    const { resultRow, titleLink, snippet } = this.config.selectors;
    const results = [];
    const seenUrls = /* @__PURE__ */ new Set();
    $(resultRow).each((_, element) => {
      if (results.length >= maxResults) return false;
      const row = $(element);
      const link = row.find(titleLink).first();
      const href = link.attr("href")?.trim();
      const title = this.extractTitle(row, link);
      if (!href || !title) return;
      const url = this.decodeResultUrl(href);
      if (!url.startsWith("http") || seenUrls.has(url)) return;
      seenUrls.add(url);
      results.push({
        title,
        url,
        snippet: collapseText(row.find(snippet).first().text())
      });
    });
    return results;
  }
};
var SearchEngineRegistry = class _SearchEngineRegistry {
  constructor(instances = _SearchEngineRegistry.defaultInstances()) {
    this.engines = new Map(instances.map((engine) => [engine.id, engine]));
  }
  static defaultInstances() {
    return [
      new DuckDuckGoSearchEngine(),
      new BingSearchEngine(),
      new GoogleSearchEngine(),
      new YandexSearchEngine(),
      new StartpageSearchEngine()
    ];
  }
  get(id) {
    const engine = this.engines.get(id);
    if (!engine) {
      throw new Error(`Unknown search engine: ${id}`);
    }
    return engine;
  }
  resolveOrder(engines) {
    const order = engines?.length ? engines : DEFAULT_SEARCH_ENGINE_ORDER;
    const seen = /* @__PURE__ */ new Set();
    const resolved = [];
    for (const id of order) {
      if (seen.has(id) || !this.engines.has(id)) continue;
      seen.add(id);
      resolved.push(id);
    }
    return resolved.length > 0 ? resolved : [...DEFAULT_SEARCH_ENGINE_ORDER];
  }
  ordered(engines) {
    return this.resolveOrder(engines).map((id) => this.get(id));
  }
};
var defaultSearchEngineRegistry = new SearchEngineRegistry();
var SEARCH_ENGINE_DEFINITIONS = Object.fromEntries(
  defaultSearchEngineRegistry.ordered().map((engine) => [
    engine.id,
    {
      id: engine.id,
      buildSearchUrl: (q, m) => engine.buildSearchUrl(q, m),
      parseResults: ($, m) => engine.parseResults($, m)
    }
  ])
);
var duckDuckGoSearchEngine = new DuckDuckGoSearchEngine();
var bingSearchEngine = new BingSearchEngine();
var googleSearchEngine = new GoogleSearchEngine();
var yandexSearchEngine = new YandexSearchEngine();
var startpageSearchEngine = new StartpageSearchEngine();

// toolSet/search-crawlers.ts
var DEFAULT_FETCH_TIMEOUT_MS = 3e4;
async function withFetchTimeout(promise, label, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Search fetch timed out after ${timeoutMs}ms (${label})`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
var CheerioCrawlerConfig = class {
  constructor(userAgent = SEARCH_CRAWLER_USER_AGENT, timeoutSecs = 25, acceptLanguage = "en-US,en;q=0.9", fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
    this.userAgent = userAgent;
    this.timeoutSecs = timeoutSecs;
    this.acceptLanguage = acceptLanguage;
    this.fetchTimeoutMs = fetchTimeoutMs;
    this.accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
  }
};
var PlaywrightCrawlerConfig = class {
  constructor(userAgent = SEARCH_CRAWLER_USER_AGENT, timeoutSecs = 25, headless = true, locale = "en-US", viewport = { width: 1280, height: 720 }, consentSelectors = '#L2AGLb, button:has-text("Accept all"), button:has-text("I agree")', resultWaitTimeoutMs = 12e3, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
    this.userAgent = userAgent;
    this.timeoutSecs = timeoutSecs;
    this.headless = headless;
    this.locale = locale;
    this.viewport = viewport;
    this.consentSelectors = consentSelectors;
    this.resultWaitTimeoutMs = resultWaitTimeoutMs;
    this.fetchTimeoutMs = fetchTimeoutMs;
  }
};
var SearchCrawlerHandler = class {
};
function createEphemeralCrawleeConfig(storageDir) {
  return new import_crawlee.Configuration({
    persistStorage: true,
    purgeOnStart: true,
    logLevel: import_log.LogLevel.WARNING,
    storageClientOptions: { storageDir }
  });
}
async function launchSearchChromium(config) {
  try {
    const { launch } = await import("cloakbrowser");
    return await launch({
      headless: config.headless,
      locale: config.locale,
      humanize: true,
      launchOptions: { timeout: config.timeoutSecs * 1e3 }
    });
  } catch {
  }
  const { chromium } = await import("playwright-core");
  const launchOptions = {
    headless: config.headless,
    timeout: config.timeoutSecs * 1e3
  };
  try {
    return await chromium.launch(launchOptions);
  } catch {
    try {
      return await chromium.launch({ ...launchOptions, channel: "chrome" });
    } catch {
      return await chromium.launch({ ...launchOptions, channel: "msedge" });
    }
  }
}
function toCrawleeRequest(spec) {
  return new import_crawlee.Request({
    url: spec.url,
    method: spec.method ?? "GET",
    payload: spec.payload,
    headers: spec.headers,
    useExtendedUniqueKey: spec.method === "POST"
  });
}
var CheerioSearchHandler = class extends SearchCrawlerHandler {
  constructor(config) {
    super();
    this.config = config;
    this.mode = "cheerio";
  }
  async fetch(spec, _options) {
    return withFetchTimeout(
      this.fetchInner(spec),
      `cheerio:${spec.url}`,
      this.config.fetchTimeoutMs
    );
  }
  async fetchInner(spec) {
    const storageDir = await (0, import_promises.mkdtemp)((0, import_node_path.join)((0, import_node_os.tmpdir)(), "openfde-cheerio-"));
    const crawleeConfig = createEphemeralCrawleeConfig(storageDir);
    let payload;
    try {
      const crawler = new import_crawlee.CheerioCrawler(
        {
          maxRequestsPerCrawl: 1,
          maxConcurrency: 1,
          requestHandlerTimeoutSecs: this.config.timeoutSecs,
          navigationTimeoutSecs: this.config.timeoutSecs,
          preNavigationHooks: [
            ({ request }) => {
              request.headers = {
                ...request.headers,
                "User-Agent": this.config.userAgent,
                Accept: this.config.accept,
                "Accept-Language": this.config.acceptLanguage,
                ...spec.headers
              };
            }
          ],
          async requestHandler({ $, request }) {
            const requestUrl = request.loadedUrl ?? request.url;
            payload = {
              $,
              requestUrl,
              html: $.html()
            };
          }
        },
        crawleeConfig
      );
      await crawler.run([toCrawleeRequest(spec)]);
    } finally {
      await (0, import_promises.rm)(storageDir, { recursive: true, force: true }).catch(() => void 0);
    }
    if (!payload) {
      throw new Error(`Cheerio crawler did not load ${spec.url}`);
    }
    return payload;
  }
};
var PlaywrightSearchHandler = class extends SearchCrawlerHandler {
  constructor(config) {
    super();
    this.config = config;
    this.mode = "playwright";
  }
  async fetch(spec, options) {
    return withFetchTimeout(
      this.fetchInner(spec, options),
      `playwright:${spec.url}`,
      this.config.fetchTimeoutMs
    );
  }
  async fetchInner(spec, options) {
    const browser = await launchSearchChromium(this.config);
    try {
      const page = await browser.newPage({
        userAgent: this.config.userAgent,
        locale: this.config.locale,
        viewport: this.config.viewport,
        extraHTTPHeaders: spec.headers
      });
      page.setDefaultTimeout(this.config.timeoutSecs * 1e3);
      if (spec.method === "POST" && spec.payload) {
        const response = await page.context().request.post(spec.url, {
          data: spec.payload,
          timeout: this.config.timeoutSecs * 1e3,
          headers: {
            ...spec.headers,
            "Content-Type": spec.headers?.["Content-Type"] ?? "application/x-www-form-urlencoded",
            "User-Agent": this.config.userAgent
          }
        });
        const html2 = await response.text();
        const requestUrl2 = response.url();
        return { $: cheerio.load(html2), requestUrl: requestUrl2, html: html2 };
      }
      await page.goto(spec.url, {
        waitUntil: "networkidle",
        timeout: this.config.timeoutSecs * 1e3
      });
      await page.locator(this.config.consentSelectors).first().click({ timeout: 2e3 }).catch(() => void 0);
      const waitSelector = options?.waitSelector;
      if (waitSelector) {
        try {
          await page.waitForSelector(waitSelector, {
            timeout: this.config.resultWaitTimeoutMs
          });
        } catch {
        }
      }
      const html = await page.content();
      const requestUrl = page.url();
      return { $: cheerio.load(html), requestUrl, html };
    } finally {
      await browser.close();
    }
  }
};
var SearchCrawlerHandlerRegistry = class _SearchCrawlerHandlerRegistry {
  constructor(cheerio2, playwright) {
    this.cheerio = cheerio2;
    this.playwright = playwright;
  }
  get(mode) {
    return mode === "cheerio" ? this.cheerio : this.playwright;
  }
  static createDefault() {
    return new _SearchCrawlerHandlerRegistry(
      new CheerioSearchHandler(new CheerioCrawlerConfig()),
      new PlaywrightSearchHandler(new PlaywrightCrawlerConfig())
    );
  }
};
var defaultSearchCrawlerHandlers = SearchCrawlerHandlerRegistry.createDefault();

// toolSet/search-crawl-loop.ts
async function runSearchCrawlLoop(engine, primarySpec, maxResults, handlers) {
  const results = [];
  let loadError;
  let fetchMode;
  const crawlAttempts = [
    {
      spec: primarySpec,
      playwrightOptions: engine.getPlaywrightRunOptions()
    }
  ];
  const fallback = engine.buildFallbackCrawlRequest?.();
  if (fallback) {
    crawlAttempts.push({
      spec: fallback,
      playwrightOptions: engine.getPlaywrightFallbackRunOptions?.(fallback) ?? engine.getPlaywrightRunOptions()
    });
  }
  const ingestPage = async (mode, $, requestUrl, html) => {
    if (html && engine.isAccessBlocked(html, requestUrl)) {
      loadError = engine.emptyResultsMessage(requestUrl);
      return;
    }
    const context = { requestUrl };
    const parsed = engine.parseResults($, maxResults, context);
    if (parsed.length === 0) {
      loadError = engine.emptyResultsMessage(requestUrl);
      return;
    }
    results.length = 0;
    results.push(...parsed);
    loadError = void 0;
    fetchMode = mode;
  };
  try {
    outer: for (const attempt of crawlAttempts) {
      let cheerioBlocked = false;
      for (const mode of engine.getCrawlModes()) {
        if (mode === "playwright" && cheerioBlocked && engine.shouldSkipPlaywrightAfterCheerioBlock?.()) {
          continue;
        }
        try {
          const handler = handlers.get(mode);
          const runOptions = mode === "playwright" ? attempt.playwrightOptions : void 0;
          const page = await handler.fetch(attempt.spec, runOptions);
          if (mode === "cheerio" && engine.isAccessBlocked(page.html, page.requestUrl)) {
            cheerioBlocked = true;
            loadError = engine.emptyResultsMessage(page.requestUrl);
            continue;
          }
          await ingestPage(mode, page.$, page.requestUrl, page.html);
          if (results.length > 0) break outer;
        } catch (e) {
          loadError = e instanceof Error ? e.message : String(e);
        }
      }
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  return {
    results,
    error: results.length === 0 ? loadError : void 0,
    fetchMode
  };
}

// toolSet/scholar-courts.ts
var SCHOLAR_FEDERAL_COURTS = [
  { key: "supreme_court", label: "US Supreme Court", asSdt: "4,180" },
  { key: "tax_court", label: "US Tax Court", asSdt: "4,192" },
  { key: "court_of_claims", label: "US Court of Federal Claims", asSdt: "4,181" },
  { key: "dc_circuit", label: "US Court of Appeals, D.C. Circuit", asSdt: "4,174" },
  { key: "first_circuit", label: "US Court of Appeals, First Circuit", asSdt: "4,175" },
  { key: "second_circuit", label: "US Court of Appeals, Second Circuit", asSdt: "4,176" },
  { key: "third_circuit", label: "US Court of Appeals, Third Circuit", asSdt: "4,177" },
  { key: "fourth_circuit", label: "US Court of Appeals, Fourth Circuit", asSdt: "4,178" },
  { key: "fifth_circuit", label: "US Court of Appeals, Fifth Circuit", asSdt: "4,179" },
  { key: "sixth_circuit", label: "US Court of Appeals, Sixth Circuit", asSdt: "4,182" },
  { key: "seventh_circuit", label: "US Court of Appeals, Seventh Circuit", asSdt: "4,183" },
  { key: "eighth_circuit", label: "US Court of Appeals, Eighth Circuit", asSdt: "4,184" },
  { key: "ninth_circuit", label: "US Court of Appeals, Ninth Circuit", asSdt: "4,185" },
  { key: "tenth_circuit", label: "US Court of Appeals, Tenth Circuit", asSdt: "4,186" },
  { key: "eleventh_circuit", label: "US Court of Appeals, Eleventh Circuit", asSdt: "4,187" },
  { key: "federal_circuit", label: "US Court of Appeals, Federal Circuit", asSdt: "4,188" }
];
var SCHOLAR_US_STATE_COURTS = [
  { state: "Alabama", code: "AL", asSdt: "4,1" },
  { state: "Alaska", code: "AK", asSdt: "4,2" },
  { state: "Arizona", code: "AZ", asSdt: "4,3" },
  { state: "Arkansas", code: "AR", asSdt: "4,4" },
  { state: "California", code: "CA", asSdt: "4,5" },
  { state: "Colorado", code: "CO", asSdt: "4,6" },
  { state: "Connecticut", code: "CT", asSdt: "4,7" },
  { state: "Delaware", code: "DE", asSdt: "4,8" },
  { state: "District of Columbia", code: "DC", asSdt: "4,9" },
  { state: "Florida", code: "FL", asSdt: "4,10" },
  { state: "Georgia", code: "GA", asSdt: "4,11" },
  { state: "Hawaii", code: "HI", asSdt: "4,12" },
  { state: "Idaho", code: "ID", asSdt: "4,13" },
  { state: "Illinois", code: "IL", asSdt: "4,14" },
  { state: "Indiana", code: "IN", asSdt: "4,15" },
  { state: "Iowa", code: "IA", asSdt: "4,16" },
  { state: "Kansas", code: "KS", asSdt: "4,17" },
  { state: "Kentucky", code: "KY", asSdt: "4,18" },
  { state: "Louisiana", code: "LA", asSdt: "4,19" },
  { state: "Maine", code: "ME", asSdt: "4,20" },
  { state: "Maryland", code: "MD", asSdt: "4,21" },
  { state: "Massachusetts", code: "MA", asSdt: "4,22" },
  { state: "Michigan", code: "MI", asSdt: "4,23" },
  { state: "Minnesota", code: "MN", asSdt: "4,24" },
  { state: "Mississippi", code: "MS", asSdt: "4,25" },
  { state: "Missouri", code: "MO", asSdt: "4,26" },
  { state: "Montana", code: "MT", asSdt: "4,27" },
  { state: "Nebraska", code: "NE", asSdt: "4,28" },
  { state: "Nevada", code: "NV", asSdt: "4,29" },
  { state: "New Hampshire", code: "NH", asSdt: "4,30" },
  { state: "New Jersey", code: "NJ", asSdt: "4,31" },
  { state: "New Mexico", code: "NM", asSdt: "4,32" },
  { state: "New York", code: "NY", asSdt: "4,33" },
  { state: "North Carolina", code: "NC", asSdt: "4,34" },
  { state: "North Dakota", code: "ND", asSdt: "4,35" },
  { state: "Ohio", code: "OH", asSdt: "4,36" },
  { state: "Oklahoma", code: "OK", asSdt: "4,37" },
  { state: "Oregon", code: "OR", asSdt: "4,38" },
  { state: "Pennsylvania", code: "PA", asSdt: "4,39" },
  { state: "Rhode Island", code: "RI", asSdt: "4,40" },
  { state: "South Carolina", code: "SC", asSdt: "4,41" },
  { state: "South Dakota", code: "SD", asSdt: "4,42" },
  { state: "Tennessee", code: "TN", asSdt: "4,43" },
  { state: "Texas", code: "TX", asSdt: "4,44" },
  { state: "Utah", code: "UT", asSdt: "4,45" },
  { state: "Vermont", code: "VT", asSdt: "4,46" },
  { state: "Virginia", code: "VA", asSdt: "4,47" },
  { state: "Washington", code: "WA", asSdt: "4,48" },
  { state: "West Virginia", code: "WV", asSdt: "4,49" },
  { state: "Wisconsin", code: "WI", asSdt: "4,50" },
  { state: "Wyoming", code: "WY", asSdt: "4,51" }
];
var federalCourtByKey = new Map(
  SCHOLAR_FEDERAL_COURTS.map((court) => [court.key, court])
);
var stateByCode = new Map(
  SCHOLAR_US_STATE_COURTS.map((entry) => [entry.code, entry])
);
var stateByName = new Map(
  SCHOLAR_US_STATE_COURTS.map((entry) => [
    entry.state.toLowerCase(),
    entry
  ])
);
function resolveScholarState(state) {
  const raw = state?.trim();
  if (!raw) return void 0;
  const upper = raw.toUpperCase();
  if (stateByCode.has(upper)) return stateByCode.get(upper);
  return stateByName.get(raw.toLowerCase());
}
function resolveScholarAsSdt(scope) {
  if (scope.customAsSdt?.trim()) return scope.customAsSdt.trim();
  if (scope.category === "article") {
    return scope.includePatents ? "7" : "0";
  }
  if (scope.federalCourt) {
    const court = federalCourtByKey.get(scope.federalCourt);
    if (court) return court.asSdt;
  }
  if (scope.category === "case_law_federal") {
    return "3";
  }
  if (scope.category === "case_law_state") {
    const stateEntry = resolveScholarState(scope.state);
    if (stateEntry) return stateEntry.asSdt;
    return "ffffffffffffe04";
  }
  if (scope.category === "case_law") {
    const stateEntry = resolveScholarState(scope.state);
    if (stateEntry) return stateEntry.asSdt;
    return "4";
  }
  return void 0;
}
function describeScholarSearchScope(scope) {
  if (scope.customAsSdt?.trim()) {
    return `custom as_sdt=${scope.customAsSdt.trim()}`;
  }
  if (scope.category === "article") {
    return scope.includePatents ? "scholarly articles (including patents)" : "scholarly articles";
  }
  if (scope.federalCourt) {
    const court = federalCourtByKey.get(scope.federalCourt);
    if (court) return `case law \u2014 ${court.label}`;
  }
  if (scope.category === "case_law_federal") {
    return "case law \u2014 all US federal courts";
  }
  if (scope.category === "case_law_state") {
    const stateEntry2 = resolveScholarState(scope.state);
    if (stateEntry2) return `case law \u2014 ${stateEntry2.state}`;
    return "case law \u2014 all US state courts";
  }
  const stateEntry = resolveScholarState(scope.state);
  if (stateEntry) return `case law \u2014 ${stateEntry.state}`;
  return "case law \u2014 all US federal and state courts";
}
function buildGoogleScholarSearchUrl(query, scope) {
  const url = new URL("https://scholar.google.com/scholar");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("hl", "en");
  const asSdt = resolveScholarAsSdt(scope);
  if (asSdt) url.searchParams.set("as_sdt", asSdt);
  return url.toString();
}

// toolSet/openalex-scholar-search.ts
var OPENALEX_API = "https://api.openalex.org/works";
var OPENALEX_USER_AGENT = "OpenFDE/1.0 (mailto:support@openfde.local; academic search fallback)";
function collapseText2(value) {
  return value.replace(/\s+/g, " ").trim();
}
function decodeAbstract(inverted) {
  if (!inverted) return "";
  const pairs = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      pairs.push([pos, word]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return collapseText2(pairs.map(([, word]) => word).join(" "));
}
function workUrl(work) {
  const landing = work.primary_location?.landing_page_url?.trim();
  if (landing?.startsWith("http")) return landing;
  const doi = work.doi?.trim();
  if (doi) {
    const normalized = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    if (normalized) return `https://doi.org/${normalized}`;
  }
  const id = work.id?.trim();
  if (id?.startsWith("http")) return id;
  return id ? `https://openalex.org/${id.replace(/^https?:\/\/openalex\.org\//i, "")}` : "";
}
function workSnippet(work) {
  const abstract = decodeAbstract(work.abstract_inverted_index);
  if (abstract) return abstract.slice(0, 500);
  const authors = (work.authorships ?? []).map((row) => row.author?.display_name?.trim()).filter(Boolean).slice(0, 4).join(", ");
  const journal = work.primary_location?.source?.display_name?.trim();
  const year = typeof work.publication_year === "number" ? String(work.publication_year) : "";
  return collapseText2(
    [authors, journal, year].filter(Boolean).join(" \u2014 ")
  );
}
function mapOpenAlexWorkToSearchResult(work) {
  const title = collapseText2(work.display_name ?? "");
  const url = workUrl(work);
  if (!title || !url.startsWith("http")) return null;
  return {
    title,
    url,
    snippet: workSnippet(work)
  };
}
async function searchOpenAlex(query, maxResults) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], searchUrl: OPENALEX_API, error: "Empty OpenAlex query" };
  }
  const url = new URL(OPENALEX_API);
  url.searchParams.set("search", trimmed);
  url.searchParams.set("per-page", String(Math.min(Math.max(maxResults, 1), 25)));
  url.searchParams.set("sort", "relevance_score:desc");
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": OPENALEX_USER_AGENT
      },
      signal: AbortSignal.timeout(2e4)
    });
    if (!response.ok) {
      return {
        results: [],
        searchUrl: url.toString(),
        error: `OpenAlex request failed (${response.status})`
      };
    }
    const payload = await response.json();
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const work of payload.results ?? []) {
      const mapped = mapOpenAlexWorkToSearchResult(work);
      if (!mapped || seen.has(mapped.url)) continue;
      seen.add(mapped.url);
      results.push(mapped);
      if (results.length >= maxResults) break;
    }
    return {
      results,
      searchUrl: url.toString(),
      error: results.length === 0 ? `No OpenAlex results for "${trimmed}".` : void 0
    };
  } catch (err) {
    return {
      results: [],
      searchUrl: url.toString(),
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

// toolSet/google-scholar-search.ts
function collapseText3(value) {
  return value.replace(/\s+/g, " ").trim();
}
function decodeScholarResultUrl(href) {
  const trimmed = href.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) {
    return new URL(trimmed, "https://scholar.google.com").toString();
  }
  return trimmed;
}
function isScholarAccessBlocked(html, requestUrl = "") {
  if (/google\.com\/sorry|\/sorry\/index/i.test(requestUrl)) return true;
  return /captcha|unusual traffic|not a robot|sorry|recaptcha|detected unusual traffic/i.test(
    html
  ) || /enable javascript|can't load|enablejs|httpservice\/retry\/enablejs/i.test(
    html
  ) || /SG_REL|trouble accessing/i.test(html);
}
function parseScholarHtmlResults($, maxResults) {
  const results = [];
  const seenUrls = /* @__PURE__ */ new Set();
  const rows = $(".gs_ri, div.gs_r");
  rows.each((_, element) => {
    if (results.length >= maxResults) return false;
    const block = $(element);
    const titleAnchor = block.find("h3.gs_rt a").first();
    const href = titleAnchor.attr("href")?.trim();
    const title = collapseText3(titleAnchor.text());
    if (!href || !title) return;
    const url = decodeScholarResultUrl(href);
    if (!url.startsWith("http") || seenUrls.has(url)) return;
    seenUrls.add(url);
    const meta = collapseText3(block.find(".gs_a").first().text());
    const snippet = collapseText3(block.find(".gs_rs").first().text());
    const combinedSnippet = [meta, snippet].filter(Boolean).join(" \u2014 ");
    results.push({
      title,
      url,
      snippet: combinedSnippet
    });
  });
  return results;
}
var GoogleScholarSearchEngine = class {
  getPlaywrightWaitSelector() {
    return "h3.gs_rt a, .gs_ri, div.gs_r";
  }
  getCrawlModes() {
    return ["playwright", "cheerio"];
  }
  buildCrawlRequest(query, scope) {
    const url = buildGoogleScholarSearchUrl(query, scope);
    return {
      url,
      method: "GET",
      label: url,
      headers: {
        Referer: "https://scholar.google.com/",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    };
  }
  getPlaywrightRunOptions() {
    return { waitSelector: this.getPlaywrightWaitSelector() };
  }
  isAccessBlocked(html, requestUrl = "") {
    return isScholarAccessBlocked(html, requestUrl);
  }
  shouldSkipPlaywrightAfterCheerioBlock() {
    return false;
  }
  parseResults($, maxResults, _context) {
    return parseScholarHtmlResults($, maxResults);
  }
  emptyResultsMessage(requestUrl) {
    return `No Google Scholar results parsed from ${requestUrl}. Scholar may have blocked automated access or the page layout changed.`;
  }
};
var googleScholarSearchEngine = new GoogleScholarSearchEngine();
async function searchGoogleScholar(query, maxResults, scope, handlers = defaultSearchCrawlerHandlers) {
  const crawlSpec = googleScholarSearchEngine.buildCrawlRequest(query, scope);
  const searchUrl = crawlSpec.label ?? crawlSpec.url;
  const scopeLabel = describeScholarSearchScope(scope);
  const engine = {
    getCrawlModes: () => googleScholarSearchEngine.getCrawlModes(),
    getPlaywrightRunOptions: () => googleScholarSearchEngine.getPlaywrightRunOptions(),
    isAccessBlocked: (html, requestUrl) => googleScholarSearchEngine.isAccessBlocked(html, requestUrl),
    parseResults: ($, max, context) => googleScholarSearchEngine.parseResults($, max, context),
    emptyResultsMessage: (requestUrl) => googleScholarSearchEngine.emptyResultsMessage(requestUrl),
    shouldSkipPlaywrightAfterCheerioBlock: () => googleScholarSearchEngine.shouldSkipPlaywrightAfterCheerioBlock()
  };
  const { results, error, fetchMode } = await runSearchCrawlLoop(
    engine,
    crawlSpec,
    maxResults,
    handlers
  );
  if (results.length > 0) {
    return {
      results,
      searchUrl,
      scopeLabel,
      error,
      fetchMode,
      source: "google_scholar"
    };
  }
  const openAlex = await searchOpenAlex(query, maxResults);
  if (openAlex.results.length > 0) {
    return {
      results: openAlex.results,
      searchUrl: openAlex.searchUrl,
      scopeLabel: `${scopeLabel} (OpenAlex fallback)`,
      source: "openalex"
    };
  }
  return {
    results,
    searchUrl,
    scopeLabel,
    error: error ?? openAlex.error ?? `No scholarly results for "${query.trim()}" (Google Scholar blocked; OpenAlex had no hits).`,
    fetchMode
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GoogleScholarSearchEngine,
  SEARCH_CRAWLER_USER_AGENT,
  decodeScholarResultUrl,
  googleScholarSearchEngine,
  isScholarAccessBlocked,
  parseScholarHtmlResults,
  searchGoogleScholar
});
//# sourceMappingURL=e93a25a74725b6d8055f25a2dcd1916217586779.js.map
