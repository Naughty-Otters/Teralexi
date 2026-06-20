import type { FlowStepConfig } from '../flow/pipeline'

export type WebScrapeConfig = {
  /** Skip the first N search hits (default 0). */
  startIndex?: number
  /** Cap how many search hits to scrape (default: all). */
  maxItems?: number
  /** Optional cap on scraped HTML length before markdown conversion. */
  maxChars?: number
}

export type ResolvedWebScrapeConfig = {
  startIndex: number
  maxItems?: number
  maxChars?: number
}

export function resolveWebScrapeConfig(
  config: WebScrapeConfig | undefined,
): ResolvedWebScrapeConfig {
  return {
    startIndex: config?.startIndex ?? 0,
    maxItems: config?.maxItems,
    maxChars: config?.maxChars,
  }
}

export function webScrapeConfigFromFlowConfig(
  flowConfig: FlowStepConfig | Record<string, unknown> | undefined,
): WebScrapeConfig | undefined {
  const raw = flowConfig?.webScrape
  if (!raw || typeof raw !== 'object') return undefined
  return raw as WebScrapeConfig
}
