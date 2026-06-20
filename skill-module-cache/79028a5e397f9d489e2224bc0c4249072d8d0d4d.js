var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// toolSet/search-crawl-loop.ts
var search_crawl_loop_exports = {};
__export(search_crawl_loop_exports, {
  runSearchCrawlLoop: () => runSearchCrawlLoop
});
module.exports = __toCommonJS(search_crawl_loop_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runSearchCrawlLoop
});
//# sourceMappingURL=79028a5e397f9d489e2224bc0c4249072d8d0d4d.js.map
