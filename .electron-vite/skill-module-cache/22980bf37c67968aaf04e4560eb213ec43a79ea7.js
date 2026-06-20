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

// toolSet/openalex-scholar-search.ts
var openalex_scholar_search_exports = {};
__export(openalex_scholar_search_exports, {
  mapOpenAlexWorkToSearchResult: () => mapOpenAlexWorkToSearchResult,
  searchOpenAlex: () => searchOpenAlex
});
module.exports = __toCommonJS(openalex_scholar_search_exports);
var OPENALEX_API = "https://api.openalex.org/works";
var OPENALEX_USER_AGENT = "OpenFDE/1.0 (mailto:support@openfde.local; academic search fallback)";
function collapseText(value) {
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
  return collapseText(pairs.map(([, word]) => word).join(" "));
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
  return collapseText(
    [authors, journal, year].filter(Boolean).join(" \u2014 ")
  );
}
function mapOpenAlexWorkToSearchResult(work) {
  const title = collapseText(work.display_name ?? "");
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  mapOpenAlexWorkToSearchResult,
  searchOpenAlex
});
//# sourceMappingURL=22980bf37c67968aaf04e4560eb213ec43a79ea7.js.map
