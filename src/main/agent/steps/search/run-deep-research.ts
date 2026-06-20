import { searchGoogleScholar } from '@toolSet/google-scholar-search'
import type { ScholarSearchScope } from '@toolSet/scholar-courts'
import type { ResolvedSearchConfig, SearchResultItem } from '../search-config'
import type { WebSearchRunResult } from './run-search'
import { emptyWebSearchResult } from './run-search'

export const DEEP_RESEARCH_ENGINE_LABEL = 'google_scholar' as const

export async function runDeepResearch(
  query: string,
  maxResults: number,
  scope: ScholarSearchScope,
): Promise<WebSearchRunResult> {
  try {
    const outcome = await searchGoogleScholar(query, maxResults, scope)
    if (outcome.results.length === 0) {
      return emptyWebSearchResult(
        outcome.error ??
          `No Google Scholar results for "${query}" (${outcome.scopeLabel}).`,
      )
    }

    const items: SearchResultItem[] = outcome.results.map((result) => ({
      address: result.url,
      brief: result.snippet.trim() || result.title.trim(),
      title: result.title.trim() || undefined,
    }))

    return {
      items,
      searchEngine: DEEP_RESEARCH_ENGINE_LABEL,
      searchUrl: outcome.searchUrl,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return emptyWebSearchResult(message)
  }
}

export async function runDeepResearchFromConfig(
  config: ResolvedSearchConfig,
  scope: ScholarSearchScope,
): Promise<WebSearchRunResult> {
  return runDeepResearch(config.topic, config.maxResults, scope)
}
