import type { AgentFlowContext } from '../../context'
import type { FlowStepConfig } from '../../flow/pipeline'

export type ResearchFinding = {
  question: string
  output: string
  round: number
}

export type ResearchResumeState = {
  topic: string
  findings: ResearchFinding[]
  researchedKeys: string[]
  pendingQuestions: string[]
  round: number
  totalResearched: number
}

export type ResearchConfig = {
  topic?: string
  maxRounds?: number
  maxQuestionsPerRound?: number
  maxTotalQuestions?: number
  tools?: string[]
  gatherPrompt?: string
  followUpPrompt?: string
}

export type ResolvedResearchConfig = {
  topic: string
  maxRounds: number
  maxQuestionsPerRound: number
  maxTotalQuestions: number
  tools: string[]
  gatherPrompt?: string
  followUpPrompt?: string
}

/** Stable key for deduplicating research questions across rounds. */
export function normalizeResearchQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function researchConfigFromFlowConfig(
  flowConfig: FlowStepConfig | Record<string, unknown> | undefined,
): ResearchConfig | undefined {
  const raw = flowConfig?.research
  if (!raw || typeof raw !== 'object') return undefined
  return raw as ResearchConfig
}

function topicFallbackFromFlow(
  flowOrTopic?: AgentFlowContext | string,
): string {
  if (typeof flowOrTopic === 'string') return flowOrTopic.trim()
  return flowOrTopic?.getLatestUserMessageContent?.()?.trim() ?? ''
}

export function resolveResearchConfig(
  config: ResearchConfig | undefined,
  flowOrTopic?: AgentFlowContext | string,
): ResolvedResearchConfig {
  return {
    topic: config?.topic?.trim() || topicFallbackFromFlow(flowOrTopic),
    maxRounds: config?.maxRounds ?? 3,
    maxQuestionsPerRound: config?.maxQuestionsPerRound ?? 5,
    maxTotalQuestions: config?.maxTotalQuestions ?? 15,
    tools: config?.tools ?? ['deep_research', 'web_search', 'web_scrape'],
    gatherPrompt: config?.gatherPrompt?.trim() || undefined,
    followUpPrompt: config?.followUpPrompt?.trim() || undefined,
  }
}
