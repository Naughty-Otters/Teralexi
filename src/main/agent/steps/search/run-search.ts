import { cascadeWebSearch } from '@toolSet/web'
import type { SearchEngineId } from '@toolSet/web-search-engines'
import type { ResolvedSearchConfig, SearchResultItem } from '../search-config'

export type WebSearchRunResult = {
  items: SearchResultItem[]
  searchEngine?: SearchEngineId
  searchUrl?: string
  error?: string
}

export function emptyWebSearchResult(error?: string): WebSearchRunResult {
  return { items: [], error }
}

export async function runWebSearch(
  config: ResolvedSearchConfig,
): Promise<WebSearchRunResult> {
  try {
    const outcome = await cascadeWebSearch(
      config.topic,
      config.maxResults,
      config.engines,
    )

    if (!outcome.success) {
      return emptyWebSearchResult(outcome.error)
    }

    const items = outcome.results.map((result) => ({
      address: result.url,
      brief: result.snippet.trim() || result.title.trim(),
      title: result.title.trim() || undefined,
    }))

    return {
      items,
      searchEngine: outcome.engine,
      searchUrl: outcome.searchUrl,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return emptyWebSearchResult(message)
  }
}
