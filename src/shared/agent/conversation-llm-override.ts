import {
  parseAgentLlmChoice,
  parseAgentLlmChoiceFromObject,
  type AgentLlmChoice,
  type AgentStageLlmSettings,
} from './stage-llm-settings'
import { isEmptyProviderOptions } from './llm-provider-options'

/** Sticky per-conversation LLM override (composer → conversation_settings). */
export type ConversationLlmOverride = AgentLlmChoice

export function parseConversationLlmOverride(
  value: unknown,
): ConversationLlmOverride | null {
  return parseAgentLlmChoiceFromObject(value)
}

export function parseConversationLlmOverrideJson(
  raw: string | null | undefined,
): ConversationLlmOverride | null {
  if (!raw?.trim()) return null
  try {
    return parseConversationLlmOverride(JSON.parse(raw))
  } catch {
    return null
  }
}

export function serializeConversationLlmOverride(
  override: ConversationLlmOverride | null | undefined,
): string {
  if (!override) return 'null'
  const choice = parseAgentLlmChoice(
    override.provider,
    override.model,
    override.providerOptions,
  )
  if (!choice) return 'null'
  const payload: Record<string, unknown> = {
    provider: choice.provider,
    model: choice.model,
  }
  if (!isEmptyProviderOptions(choice.providerOptions)) {
    payload.providerOptions = choice.providerOptions
  }
  return JSON.stringify(payload)
}

/**
 * Strip Vue proxies / non-cloneable values so Electron IPC structured clone works.
 */
export function toPlainConversationLlmOverride(
  override: ConversationLlmOverride | null | undefined,
): ConversationLlmOverride | null {
  return parseConversationLlmOverrideJson(
    serializeConversationLlmOverride(override),
  )
}

/**
 * Apply a composer override onto agent stage settings.
 * Replaces top-level default provider/model/providerOptions only.
 * Existing per-stage rows are kept; stages that inherit default pick up the override.
 */
export function mergeAgentStageLlmWithOverride(
  settings: AgentStageLlmSettings,
  override: ConversationLlmOverride | null | undefined,
): AgentStageLlmSettings {
  const choice = override
    ? parseAgentLlmChoice(
        override.provider,
        override.model,
        override.providerOptions,
      )
    : null
  if (!choice) return settings
  return {
    ...settings,
    default: choice,
  }
}

export function resolveRunLlmFromAgentAndOverride(
  agent: { provider: string; model: string; stageLlmSettings?: AgentStageLlmSettings },
  override: ConversationLlmOverride | null | undefined,
): {
  provider: AgentLlmChoice['provider']
  model: string
  stageLlm: AgentStageLlmSettings
} {
  const base: AgentStageLlmSettings =
    agent.stageLlmSettings ??
    ({
      mode: 'unified',
      default: parseAgentLlmChoice(agent.provider, agent.model) ?? {
        provider: 'ollama',
        model: agent.model || '',
      },
    } satisfies AgentStageLlmSettings)

  const stageLlm = mergeAgentStageLlmWithOverride(base, override)
  return {
    provider: stageLlm.default.provider,
    model: stageLlm.default.model,
    stageLlm,
  }
}
