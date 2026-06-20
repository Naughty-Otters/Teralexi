import type { ResolvedSearchConfig } from '../search-config'
import {
  chooseSearchBackend,
  type SearchBackendChoice,
  type SearchBackendMode,
} from './choose-search-backend'
import { runDeepResearch } from './run-deep-research'
import { runWebSearch, type WebSearchRunResult } from './run-search'

export type RoutedSearchRunResult = WebSearchRunResult & {
  query: string
  backend: SearchBackendChoice['backend']
  routingReason: string
  /** True when scholar returned no hits and web search was used as fallback. */
  usedWebFallback?: boolean
}

export async function runRoutedSearch(
  config: ResolvedSearchConfig,
  query: string,
  mode: SearchBackendMode = config.searchMode ?? 'auto',
): Promise<RoutedSearchRunResult> {
  const choice = chooseSearchBackend(query, mode)
  const scope = config.scholarCategory
    ? { ...choice.scope, category: config.scholarCategory }
    : choice.scope

  if (choice.backend === 'scholar') {
    const scholarResult = await runDeepResearch(
      query,
      config.perQueryMaxResults,
      scope,
    )
    if (scholarResult.items.length > 0 || mode === 'scholar') {
      return {
        ...scholarResult,
        query,
        backend: 'scholar',
        routingReason: choice.reason,
      }
    }

    const webFallback = await runWebSearch({
      ...config,
      topic: query,
      maxResults: config.perQueryMaxResults,
    })
    return {
      ...webFallback,
      query,
      backend: 'web',
      routingReason: `${choice.reason}; scholar had no results — fell back to web search`,
      usedWebFallback: true,
    }
  }

  const webResult = await runWebSearch({
    ...config,
    topic: query,
    maxResults: config.perQueryMaxResults,
  })
  return {
    ...webResult,
    query,
    backend: 'web',
    routingReason: choice.reason,
  }
}
