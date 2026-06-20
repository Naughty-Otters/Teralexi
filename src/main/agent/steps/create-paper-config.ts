import type { AgentFlowContext } from '../context'
import { resolveSearchTopic } from './search-config'
import type { SearchConfig } from './search-config'

export type CreatePaperConfig = {
  /** Research topic override; defaults to prior search topic. */
  topic?: string
  /** Sandbox filename (default `research-report.pdf`). */
  outputFileName?: string
  /** Max characters read per source page for the LLM (default 12_000). */
  maxCharsPerSource?: number
  /** Optional override for the paper-writing system prompt. */
  paperPrompt?: string
}

export type ResolvedCreatePaperConfig = {
  topic: string
  outputFileName: string
  maxCharsPerSource: number
  paperPrompt?: string
}

export function resolveCreatePaperConfig(
  config: CreatePaperConfig | undefined,
  ctx: AgentFlowContext,
): ResolvedCreatePaperConfig {
  const searchConfig: SearchConfig | undefined = config?.topic
    ? { topic: config.topic }
    : undefined
  return {
    topic: resolveSearchTopic(searchConfig, ctx),
    outputFileName: config?.outputFileName?.trim() || 'research-report.pdf',
    maxCharsPerSource: config?.maxCharsPerSource ?? 12_000,
    paperPrompt: config?.paperPrompt?.trim() || undefined,
  }
}

export function createPaperConfigFromFlowConfig(
  flowConfig: Record<string, unknown> | undefined,
): CreatePaperConfig | undefined {
  const raw = flowConfig?.createPaper
  if (!raw || typeof raw !== 'object') return undefined
  return raw as CreatePaperConfig
}
