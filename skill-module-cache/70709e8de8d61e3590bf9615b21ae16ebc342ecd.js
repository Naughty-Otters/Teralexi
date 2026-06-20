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

// toolSet/web.ts
var web_exports = {};
__export(web_exports, {
  BingSearchEngine: () => BingSearchEngine,
  CheerioCrawlerConfig: () => CheerioCrawlerConfig,
  CheerioSearchHandler: () => CheerioSearchHandler,
  DEFAULT_SEARCH_ENGINE_ORDER: () => DEFAULT_SEARCH_ENGINE_ORDER,
  DuckDuckGoSearchEngine: () => DuckDuckGoSearchEngine,
  GoogleSearchEngine: () => GoogleSearchEngine,
  PlaywrightCrawlerConfig: () => PlaywrightCrawlerConfig,
  PlaywrightSearchHandler: () => PlaywrightSearchHandler,
  SEARCH_CRAWLER_USER_AGENT: () => SEARCH_CRAWLER_USER_AGENT,
  SEARCH_ENGINE_DEFINITIONS: () => SEARCH_ENGINE_DEFINITIONS,
  SearchCrawlerHandler: () => SearchCrawlerHandler,
  SearchCrawlerHandlerRegistry: () => SearchCrawlerHandlerRegistry,
  SearchEngine: () => SearchEngine,
  SearchEngineRegistry: () => SearchEngineRegistry,
  StartpageSearchEngine: () => StartpageSearchEngine,
  YandexSearchEngine: () => YandexSearchEngine,
  buildStartpageSearchUrl: () => buildStartpageSearchUrl,
  cascadeWebSearch: () => cascadeWebSearch,
  decodeDuckDuckGoResultUrl: () => decodeDuckDuckGoResultUrl,
  decodeGoogleResultUrl: () => decodeGoogleResultUrl,
  decodeYandexResultUrl: () => decodeYandexResultUrl,
  defaultSearchCrawlerHandlers: () => defaultSearchCrawlerHandlers,
  defaultSearchEngineRegistry: () => defaultSearchEngineRegistry,
  extractPageContent: () => extractPageContent,
  extractPageText: () => extractPageText,
  htmlToMarkdown: () => htmlToMarkdown,
  isJsShellHtml: () => isJsShellHtml,
  isParseableMarkdown: () => isParseableMarkdown,
  isScrapeContentInsufficient: () => isScrapeContentInsufficient,
  isScrapeHtmlInsufficient: () => isScrapeHtmlInsufficient,
  isScrapeMarkdownInsufficient: () => isScrapeMarkdownInsufficient,
  isScrapeTextInsufficient: () => isScrapeTextInsufficient,
  isYandexAccessBlocked: () => isYandexAccessBlocked,
  parseBingHtmlResults: () => parseBingHtmlResults,
  parseDuckDuckGoHtmlResults: () => parseDuckDuckGoHtmlResults,
  parseGoogleHtmlResults: () => parseGoogleHtmlResults,
  parseStartpageHtmlResults: () => parseStartpageHtmlResults,
  parseYandexHtmlResults: () => parseYandexHtmlResults,
  resolveSearchEngineOrder: () => resolveSearchEngineOrder,
  scrapePage: () => scrapePage,
  searchWithEngine: () => searchWithEngine,
  searchWithEngineMode: () => searchWithEngineMode,
  webScrape: () => webScrape,
  webSearch: () => webSearch
});
module.exports = __toCommonJS(web_exports);
var import_promises2 = require("node:fs/promises");
var import_node_os2 = require("node:os");
var import_node_path2 = require("node:path");
var import_log2 = require("@apify/log");
var import_crawlee2 = require("crawlee");
var import_zod2 = require("zod");

// toolSet/html-to-markdown.ts
var import_markdown_it = __toESM(require("markdown-it"));
var import_turndown = __toESM(require("turndown"));
var import_turndown_plugin_gfm = require("turndown-plugin-gfm");
var turndownService;
var markdownParser = new import_markdown_it.default({
  html: false,
  linkify: false,
  breaks: false
});
function getTurndownService() {
  if (!turndownService) {
    turndownService = new import_turndown.default({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      bulletListMarker: "-"
    });
    turndownService.remove(["script", "style", "noscript"]);
    turndownService.use(import_turndown_plugin_gfm.gfm);
  }
  return turndownService;
}
function isParseableMarkdown(markdown) {
  try {
    markdownParser.parse(markdown);
    return true;
  } catch {
    return false;
  }
}
function htmlToMarkdown(html, title) {
  const converted = getTurndownService().turndown(html).trim();
  const withTitle = title?.trim() ? `# ${title.trim()}

${converted}` : converted;
  return withTitle.replace(/\n{3,}/g, "\n\n").trim();
}

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
function resolveSearchEngineOrder(engines) {
  return defaultSearchEngineRegistry.resolveOrder(engines);
}
var duckDuckGoSearchEngine = new DuckDuckGoSearchEngine();
var bingSearchEngine = new BingSearchEngine();
var googleSearchEngine = new GoogleSearchEngine();
var yandexSearchEngine = new YandexSearchEngine();
var startpageSearchEngine = new StartpageSearchEngine();
function parseDuckDuckGoHtmlResults($, maxResults) {
  return duckDuckGoSearchEngine.parseResults($, maxResults);
}
function parseBingHtmlResults($, maxResults) {
  return bingSearchEngine.parseResults($, maxResults);
}
function parseGoogleHtmlResults($, maxResults) {
  return googleSearchEngine.parseResults($, maxResults);
}
function parseYandexHtmlResults($, maxResults) {
  return yandexSearchEngine.parseResults($, maxResults);
}

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

// toolSet/web.ts
var DEFAULT_MAX_SEARCH_RESULTS = 8;
var CRAWLER_TIMEOUT_SECS = 25;
var crawlerPreNavigationHooks = [
  ({ request }) => {
    request.headers = {
      ...request.headers,
      "User-Agent": SEARCH_CRAWLER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
  }
];
var webSearchInput = import_zod2.z.object({
  query: import_zod2.z.string().min(1).describe('Search query, e.g. "mass of Earth" or "quotes to scrape API".'),
  maxResults: import_zod2.z.number().int().min(1).max(20).optional().default(DEFAULT_MAX_SEARCH_RESULTS).describe("Maximum organic results to return (1\u201320)."),
  engines: import_zod2.z.array(searchEngineId).optional().describe(
    "Optional engine order. Defaults to duckduckgo \u2192 bing \u2192 google \u2192 yandex; tries each until results are found."
  )
});
var webScrapeInput = import_zod2.z.object({
  url: import_zod2.z.string().url().optional().describe("Single page URL to fetch."),
  urls: import_zod2.z.array(import_zod2.z.string().url()).optional().describe("Multiple page URLs to fetch in one call."),
  maxChars: import_zod2.z.number().int().positive().optional().describe(
    "Optional per-page character cap for `html`. Omit to return the full page (no truncation)."
  )
});
function createEphemeralCrawleeConfig2(storageDir) {
  return new import_crawlee2.Configuration({
    persistStorage: true,
    purgeOnStart: true,
    logLevel: import_log2.LogLevel.WARNING,
    storageClientOptions: { storageDir }
  });
}
function prepareScrapeDocument($) {
  $("script, style, noscript").remove();
  const html = $("html");
  return html.length > 0 ? html : $.root();
}
function applyMaxChars(value, maxChars) {
  if (maxChars == null || value.length <= maxChars) {
    return { value, truncated: false };
  }
  return { value: value.slice(0, maxChars), truncated: true };
}
function serializeScrapeHtml($) {
  const htmlEl = $("html");
  if (htmlEl.length > 0) {
    return $.html(htmlEl) ?? "";
  }
  return $.root().html() ?? "";
}
function extractPageContent($, options) {
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  prepareScrapeDocument($);
  const htmlResult = applyMaxChars(serializeScrapeHtml($), options?.maxChars);
  return {
    title,
    html: htmlResult.value,
    truncated: htmlResult.truncated
  };
}
function extractPageText($, options) {
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const root = prepareScrapeDocument($);
  const raw = root.text().replace(/\s+/g, " ").trim();
  const textResult = applyMaxChars(raw, options?.maxChars);
  return { title, text: textResult.value, truncated: textResult.truncated };
}
function asSearchCrawlEngineAdapter(engine, query, maxResults) {
  return {
    getCrawlModes: () => engine.getCrawlModes(),
    getPlaywrightRunOptions: () => engine.getPlaywrightRunOptions(),
    getPlaywrightFallbackRunOptions: (fallback) => engine.getPlaywrightFallbackRunOptions(fallback),
    buildFallbackCrawlRequest: () => engine.buildFallbackCrawlRequest(query, maxResults),
    isAccessBlocked: (html, requestUrl) => engine.isAccessBlocked(html, requestUrl),
    parseResults: ($, max, context) => engine.parseResults($, max, context),
    emptyResultsMessage: (requestUrl) => engine.emptyResultsMessage(requestUrl),
    shouldSkipPlaywrightAfterCheerioBlock: () => engine.shouldSkipPlaywrightAfterCheerioBlock()
  };
}
async function searchWithEngine(engineId, query, maxResults, handlers = defaultSearchCrawlerHandlers) {
  const engine = defaultSearchEngineRegistry.get(engineId);
  const crawlSpec = engine.buildCrawlRequest(query, maxResults);
  const searchUrl = crawlSpec.label ?? crawlSpec.url;
  const { results, error } = await runSearchCrawlLoop(
    asSearchCrawlEngineAdapter(engine, query, maxResults),
    crawlSpec,
    maxResults,
    handlers
  );
  return {
    results,
    searchUrl,
    error
  };
}
async function searchWithEngineMode(engineId, query, maxResults, mode, handlers = defaultSearchCrawlerHandlers) {
  const engine = defaultSearchEngineRegistry.get(engineId);
  const crawlSpec = engine.buildCrawlRequest(query, maxResults);
  const searchUrl = crawlSpec.label ?? crawlSpec.url;
  const results = [];
  let loadError;
  const ingestPage = async ($, requestUrl, html) => {
    if (html && engine.isAccessBlocked(html, requestUrl)) {
      loadError = engine.emptyResultsMessage(requestUrl);
      return;
    }
    const parsed = engine.parseResults($, maxResults, { requestUrl });
    if (parsed.length === 0) {
      loadError = engine.emptyResultsMessage(requestUrl);
      return;
    }
    results.push(...parsed);
    loadError = void 0;
  };
  const crawlAttempts = [
    {
      spec: crawlSpec,
      playwrightOptions: engine.getPlaywrightRunOptions()
    }
  ];
  const fallback = engine.buildFallbackCrawlRequest(query, maxResults);
  if (fallback) {
    crawlAttempts.push({
      spec: fallback,
      playwrightOptions: engine.getPlaywrightFallbackRunOptions(fallback)
    });
  }
  try {
    for (const attempt of crawlAttempts) {
      if (results.length > 0) break;
      try {
        const handler = handlers.get(mode);
        const runOptions = mode === "playwright" ? attempt.playwrightOptions : void 0;
        const page = await handler.fetch(attempt.spec, runOptions);
        if (mode === "cheerio" && engine.isAccessBlocked(page.html, page.requestUrl)) {
          loadError = engine.emptyResultsMessage(page.requestUrl);
          continue;
        }
        await ingestPage(page.$, page.requestUrl, page.html);
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  return {
    results,
    searchUrl,
    mode,
    error: results.length === 0 ? loadError : void 0
  };
}
async function cascadeWebSearch(query, maxResults, engines) {
  const order = defaultSearchEngineRegistry.resolveOrder(engines);
  const attempts = [];
  for (const engineId of order) {
    const attempt = await searchWithEngine(engineId, query, maxResults);
    const succeeded = attempt.results.length > 0;
    attempts.push({
      engine: engineId,
      success: succeeded,
      searchUrl: attempt.searchUrl,
      resultCount: attempt.results.length,
      error: succeeded ? void 0 : attempt.error
    });
    if (succeeded) {
      return {
        success: true,
        engine: engineId,
        searchUrl: attempt.searchUrl,
        resultCount: attempt.results.length,
        results: attempt.results,
        attempts
      };
    }
  }
  return {
    success: false,
    error: `All search engines failed for "${query}" (${order.join(" \u2192 ")}). Last error: ${attempts.at(-1)?.error ?? "no results parsed"}`,
    query,
    attempts
  };
}
async function withEphemeralCrawler(run) {
  const storageDir = await (0, import_promises2.mkdtemp)((0, import_node_path2.join)((0, import_node_os2.tmpdir)(), "openfde-crawlee-"));
  const config = createEphemeralCrawleeConfig2(storageDir);
  try {
    return await run(config);
  } finally {
    await (0, import_promises2.rm)(storageDir, { recursive: true, force: true }).catch(() => void 0);
  }
}
var webSearch = {
  name: "web_search",
  tags: ["web"],
  description: "Search the public web (Cheerio and Playwright). Tries DuckDuckGo, Bing, Google, Yandex, then Startpage until results are found. Each engine is attempted with Cheerio first, then Playwright. Returns titles, URLs, snippets, which engine succeeded, and per-engine attempt notes. Optional `engines` overrides order. No API keys.",
  inputSchema: webSearchInput,
  needsApproval: false,
  async execute(input) {
    const parsed = webSearchInput.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }
    const { query, maxResults, engines } = parsed.data;
    try {
      const outcome = await cascadeWebSearch(query, maxResults, engines);
      if (!outcome.success) {
        return outcome;
      }
      return {
        success: true,
        query,
        searchUrl: outcome.searchUrl,
        engine: outcome.engine,
        resultCount: outcome.resultCount,
        results: outcome.results,
        attempts: outcome.attempts
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        query
      };
    }
  }
};
var MIN_SCRAPE_HTML_CHARS = 80;
function isJsShellHtml(html) {
  return /enablejs|httpservice\/retry\/enablejs/i.test(html) || /please enable javascript|javascript is disabled/i.test(html);
}
function isScrapeHtmlInsufficient(html, minChars = MIN_SCRAPE_HTML_CHARS) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length < minChars;
}
function isScrapeMarkdownInsufficient(html, minChars = MIN_SCRAPE_HTML_CHARS) {
  return isScrapeHtmlInsufficient(html, minChars);
}
function isScrapeTextInsufficient(text, minChars = MIN_SCRAPE_HTML_CHARS) {
  return text.replace(/\s+/g, " ").trim().length < minChars;
}
function isScrapeContentInsufficient(_text, html, minChars = MIN_SCRAPE_HTML_CHARS) {
  return isScrapeHtmlInsufficient(html ?? "", minChars);
}
async function scrapeUrlWithCheerio(url, options) {
  let scraped = null;
  await withEphemeralCrawler(async (config) => {
    const crawler = new import_crawlee2.CheerioCrawler(
      {
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1,
        requestHandlerTimeoutSecs: CRAWLER_TIMEOUT_SECS,
        navigationTimeoutSecs: CRAWLER_TIMEOUT_SECS,
        preNavigationHooks: crawlerPreNavigationHooks,
        async requestHandler({ $, request }) {
          const html = $.html();
          if (isJsShellHtml(html)) return;
          const extracted = extractPageContent($, {
            maxChars: options?.maxChars
          });
          if (isScrapeHtmlInsufficient(extracted.html)) {
            return;
          }
          scraped = {
            url: request.url,
            loadedUrl: request.loadedUrl,
            title: extracted.title,
            html: extracted.html,
            truncated: extracted.truncated,
            fetchMode: "cheerio"
          };
        }
      },
      config
    );
    await crawler.run([url]);
  });
  return scraped;
}
async function scrapeUrlWithPlaywright(url, options, handlers = defaultSearchCrawlerHandlers) {
  const spec = { url, method: "GET", label: url };
  const payload = await handlers.playwright.fetch(spec, { waitSelector: "html" });
  if (isJsShellHtml(payload.html)) return null;
  const extracted = extractPageContent(payload.$, {
    maxChars: options?.maxChars
  });
  if (isScrapeHtmlInsufficient(extracted.html)) {
    return null;
  }
  return {
    url,
    loadedUrl: payload.requestUrl,
    title: extracted.title,
    html: extracted.html,
    truncated: extracted.truncated,
    fetchMode: "playwright"
  };
}
async function scrapePage(url, options, handlers = defaultSearchCrawlerHandlers) {
  let cheerioError;
  try {
    const cheerioPage = await scrapeUrlWithCheerio(url, options);
    if (cheerioPage) return cheerioPage;
  } catch (e) {
    cheerioError = e instanceof Error ? e.message : String(e);
  }
  try {
    const playwrightPage = await scrapeUrlWithPlaywright(url, options, handlers);
    if (playwrightPage) return playwrightPage;
  } catch (e) {
    const playwrightError = e instanceof Error ? e.message : String(e);
    throw new Error(
      playwrightError + (cheerioError ? ` (Cheerio: ${cheerioError})` : "")
    );
  }
  throw new Error(
    cheerioError ?? `Could not extract enough HTML from ${url} via Cheerio or Playwright.`
  );
}
var webScrape = {
  name: "web_scrape",
  tags: ["web"],
  description: "Fetch public pages and return each page as `title` plus full-document `html` (entire page; script/style/noscript removed; no auto-selection of main/article). Uses Cheerio first; falls back to Playwright when the page is empty or JS-only. Pass `url` or `urls`. Optional `maxChars` caps HTML length; omit it for no limit.",
  inputSchema: webScrapeInput,
  needsApproval: false,
  async execute(input) {
    const parsed = webScrapeInput.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }
    const { url, urls, maxChars } = parsed.data;
    const targetUrls = [...urls ?? [], ...url ? [url] : []];
    if (targetUrls.length === 0) {
      return {
        success: false,
        error: "Provide `url` or a non-empty `urls` array."
      };
    }
    try {
      const pages = [];
      const errors = [];
      for (const targetUrl of targetUrls) {
        try {
          pages.push(
            await scrapePage(targetUrl, { maxChars })
          );
        } catch (e) {
          errors.push(
            `${targetUrl}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      if (pages.length === 0) {
        return {
          success: false,
          error: errors.join("; ") || "No pages were scraped. URLs may be unreachable or blocked.",
          urls: targetUrls
        };
      }
      return {
        success: true,
        pageCount: pages.length,
        pages,
        ...errors.length > 0 ? { partialErrors: errors } : {}
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        urls: targetUrls
      };
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BingSearchEngine,
  CheerioCrawlerConfig,
  CheerioSearchHandler,
  DEFAULT_SEARCH_ENGINE_ORDER,
  DuckDuckGoSearchEngine,
  GoogleSearchEngine,
  PlaywrightCrawlerConfig,
  PlaywrightSearchHandler,
  SEARCH_CRAWLER_USER_AGENT,
  SEARCH_ENGINE_DEFINITIONS,
  SearchCrawlerHandler,
  SearchCrawlerHandlerRegistry,
  SearchEngine,
  SearchEngineRegistry,
  StartpageSearchEngine,
  YandexSearchEngine,
  buildStartpageSearchUrl,
  cascadeWebSearch,
  decodeDuckDuckGoResultUrl,
  decodeGoogleResultUrl,
  decodeYandexResultUrl,
  defaultSearchCrawlerHandlers,
  defaultSearchEngineRegistry,
  extractPageContent,
  extractPageText,
  htmlToMarkdown,
  isJsShellHtml,
  isParseableMarkdown,
  isScrapeContentInsufficient,
  isScrapeHtmlInsufficient,
  isScrapeMarkdownInsufficient,
  isScrapeTextInsufficient,
  isYandexAccessBlocked,
  parseBingHtmlResults,
  parseDuckDuckGoHtmlResults,
  parseGoogleHtmlResults,
  parseStartpageHtmlResults,
  parseYandexHtmlResults,
  resolveSearchEngineOrder,
  scrapePage,
  searchWithEngine,
  searchWithEngineMode,
  webScrape,
  webSearch
});
//# sourceMappingURL=70709e8de8d61e3590bf9615b21ae16ebc342ecd.js.map
