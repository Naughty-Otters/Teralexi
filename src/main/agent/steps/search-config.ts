import type { SearchEngineId } from '@toolSet/web-search-engines'
import type { ScholarSearchCategory } from '@toolSet/scholar-courts'
import type { AgentFlowContext } from '../context'
import { latestThinkingStepData } from '../expr/thinking-utils'
import type { SearchBackendMode } from './search/choose-search-backend'

export type SearchResultItem = {
  /** Source URL. */
  address: string
  /** Short snippet or summary line from the search engine. */
  brief: string
  /** Page title when available. */
  title?: string
}

export type SearchConfig = {
  /** Search query; defaults to the latest user message. */
  topic?: string
  /** Maximum SERP rows to keep (default 8). */
  maxResults?: number
  /** Number of angle queries to run (default 1; opt-in when > 1). */
  queryExpansionCount?: number
  /** Per-angle SERP rows when query expansion is enabled (default maxResults). */
  perQueryMaxResults?: number
  /** Final merged item cap after dedup (default maxResults). */
  totalResultCap?: number
  /** Search engine preference order. */
  engines?: SearchEngineId[]
  /** Optional override for query-expansion LLM system prompt. */
  queryExpansionPrompt?: string
  /** Optional override for the total-abstraction LLM system prompt. */
  abstractionPrompt?: string
  /**
   * How to pick search backend per query: `auto` (default) routes between
   * web SERP and Google Scholar deep research from query content.
   */
  searchMode?: SearchBackendMode
  /** When using scholar, optional category override (auto infers from query). */
  scholarCategory?: ScholarSearchCategory
}

export type ResolvedSearchConfig = {
  topic: string
  maxResults: number
  queryExpansionCount: number
  perQueryMaxResults: number
  totalResultCap: number
  engines?: SearchEngineId[]
  queryExpansionPrompt?: string
  abstractionPrompt?: string
  searchMode: SearchBackendMode
  scholarCategory?: ScholarSearchCategory
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num < 1) return fallback
  return Math.floor(num)
}

export function resolveSearchTopic(
  config: SearchConfig | undefined,
  ctx: AgentFlowContext,
): string {
  if (config?.topic?.trim()) return config.topic.trim()
  const thinking = latestThinkingStepData(ctx)
  return (
    thinking?.task?.trim() ||
    thinking?.goal?.trim() ||
    ctx.getLatestUserMessageContent?.() ||
    ''
  )
}

export function resolveSearchConfig(
  config: SearchConfig | undefined,
  ctx: AgentFlowContext,
): ResolvedSearchConfig {
  const maxResults = normalizePositiveInt(config?.maxResults, 8)
  const queryExpansionCount = normalizePositiveInt(
    config?.queryExpansionCount,
    1,
  )
  const perQueryMaxResults = normalizePositiveInt(
    config?.perQueryMaxResults,
    maxResults,
  )
  const totalResultCap = normalizePositiveInt(
    config?.totalResultCap,
    maxResults,
  )

  return {
    topic: resolveSearchTopic(config, ctx),
    maxResults,
    queryExpansionCount,
    perQueryMaxResults,
    totalResultCap,
    engines: config?.engines?.length ? [...config.engines] : undefined,
    queryExpansionPrompt: config?.queryExpansionPrompt?.trim() || undefined,
    abstractionPrompt: config?.abstractionPrompt?.trim() || undefined,
    searchMode: config?.searchMode ?? 'auto',
    scholarCategory: config?.scholarCategory,
  }
}

export function searchConfigFromFlowConfig(
  flowConfig: Record<string, unknown> | undefined,
): SearchConfig | undefined {
  const raw = flowConfig?.search
  if (!raw || typeof raw !== 'object') return undefined
  return raw as SearchConfig
}
