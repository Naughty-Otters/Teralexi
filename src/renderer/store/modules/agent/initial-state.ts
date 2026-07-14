import { applyCodingDirectToolLoopPolicy } from '@shared/agent/coding-agent-pipeline'
import { normalizeExecutionSteps } from '@shared/agent/execution-steps'
import {
  isOpenAiCompatibleProvider,
  LLM_PROVIDER_IDS,
  OPENAI_COMPATIBLE_LLM_PROVIDERS,
  OPENAI_COMPATIBLE_PROVIDER_IDS,
  type OpenAiCompatibleProviderId,
} from '@shared/agent/llm-provider-registry'
import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  XAI_MODELS,
  ZHIPU_MODELS,
} from './config'
import type { Agent, AgentExecutionSteps, ProviderType } from './types'
import type {
  AgentLlmChoice,
  AgentLlmProviderOptions,
  AgentLlmStage,
} from '@shared/agent/stage-llm-settings'

type AgentColor = Agent['color']

export function createInitialModelsByProvider(): Record<ProviderType, string[]> {
  const out = {} as Record<ProviderType, string[]>
  for (const id of LLM_PROVIDER_IDS) {
    if (id === 'anthropic') out[id] = [...ANTHROPIC_MODELS]
    else if (id === 'deepseek') out[id] = [...DEEPSEEK_MODELS]
    else if (id === 'xai') out[id] = [...XAI_MODELS]
    else if (id === 'zhipu') out[id] = [...ZHIPU_MODELS]
    else if (isOpenAiCompatibleProvider(id)) {
      out[id] = [...OPENAI_COMPATIBLE_LLM_PROVIDERS[id].defaultModels]
    } else out[id] = []
  }
  return out
}

export function createInitialOpenAiCompatibleApiKeys(): Record<
  OpenAiCompatibleProviderId,
  string
> {
  return Object.fromEntries(
    OPENAI_COMPATIBLE_PROVIDER_IDS.map((id) => [id, '']),
  ) as Record<OpenAiCompatibleProviderId, string>
}

export function createInitialOpenAiCompatibleBaseUrls(): Record<
  OpenAiCompatibleProviderId,
  string
> {
  return Object.fromEntries(
    OPENAI_COMPATIBLE_PROVIDER_IDS.map((id) => [
      id,
      OPENAI_COMPATIBLE_LLM_PROVIDERS[id].defaultBaseUrl,
    ]),
  ) as Record<OpenAiCompatibleProviderId, string>
}

export function syncAgentExecutionSteps(agent: Agent): void {
  agent.executionSteps = normalizeExecutionSteps(agent) as AgentExecutionSteps
  applyCodingDirectToolLoopPolicy(agent)
}

export type PersistedAgentConfiguration = {
  agentId: string
  userId: string
  name: string
  description: string
  model: string
  provider: ProviderType
  color: AgentColor
  enabled: boolean
  systemPrompt: string
  skillsPrompt: string
  availableSet: string[]
  availableSetTouched: boolean
  toolNeedsApprovalOverrides: Record<string, boolean>
  availableMcpServers: string[] | null
  toolLoopMaxIterations: number
  todoMaxRetries: number
  allowAsSubAgent?: boolean
  allowSubAgents?: boolean
  subAgentIds?: string[] | null
  llmRoutingMode?: 'unified' | 'per_stage'
  stageLlm?: Partial<Record<AgentLlmStage, AgentLlmChoice>>
  defaultProviderOptions?: AgentLlmProviderOptions
  createdAt: string
  updatedAt: string
}

export type ProviderConnectionTestResult = {
  ok: boolean
  modelCount?: number
  error?: string
}
