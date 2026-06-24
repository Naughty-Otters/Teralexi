import type { LlmProviderCredentialsSnapshot } from './provider-setup-status'
import { isLlmProviderConfigured } from './provider-setup-status'
import type { ProviderType } from './llm-provider-registry'
import {
  parseAgentStageLlmSettings,
  resolveStageLlmChoice,
  type AgentLlmChoice,
  type AgentLlmStage,
  AGENT_LLM_STAGES,
} from './stage-llm-settings'

export type OnboardingAgentSnapshot = {
  provider: ProviderType
  model: string
  llmRoutingMode?: 'unified' | 'per_stage'
  stageLlm?: Partial<Record<AgentLlmStage, AgentLlmChoice>>
}

export function isAgentLlmChoiceReady(
  choice: AgentLlmChoice | null | undefined,
  creds: LlmProviderCredentialsSnapshot,
): boolean {
  if (!choice?.provider || !choice.model.trim()) return false
  return isLlmProviderConfigured(choice.provider, creds)
}

export function isAgentReadyForOnboarding(
  agent: OnboardingAgentSnapshot,
  creds: LlmProviderCredentialsSnapshot,
): boolean {
  const settings = parseAgentStageLlmSettings({
    provider: agent.provider,
    model: agent.model,
    routingMode: agent.llmRoutingMode,
    stageLlmJson: agent.stageLlm
      ? JSON.stringify(agent.stageLlm)
      : undefined,
  })

  if (!isAgentLlmChoiceReady(settings.default, creds)) return false

  if (settings.mode !== 'per_stage') return true

  for (const stage of AGENT_LLM_STAGES) {
    const choice = resolveStageLlmChoice(settings, stage)
    if (!isAgentLlmChoiceReady(choice, creds)) return false
  }
  return true
}

export function areAllAgentsReadyForOnboarding(
  agents: readonly OnboardingAgentSnapshot[],
  creds: LlmProviderCredentialsSnapshot,
): boolean {
  if (agents.length === 0) return true
  return agents.every((agent) => isAgentReadyForOnboarding(agent, creds))
}
