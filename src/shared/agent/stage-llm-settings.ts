import {
  LLM_PROVIDER_IDS,
  type ProviderType,
} from './llm-provider-registry'

export type AgentLlmRoutingMode = 'unified' | 'per_stage'

export const AGENT_LLM_STAGES = [
  'explore',
  'toolLoop',
  'toolLoopRecovery',
  'verifier',
] as const

export type AgentLlmStage = (typeof AGENT_LLM_STAGES)[number]

export type AgentLlmChoice = {
  provider: ProviderType
  model: string
}

export type AgentStageLlmSettings = {
  mode: AgentLlmRoutingMode
  default: AgentLlmChoice
  stages?: Partial<Record<AgentLlmStage, AgentLlmChoice>>
}

export const AGENT_LLM_STAGE_LABELS: Record<AgentLlmStage, string> = {
  explore: 'Explore',
  toolLoop: 'Tool loop',
  toolLoopRecovery:
    'Failure recovery (todo retry / manual intervention follow-up)',
  verifier: 'Verifier',
}

function isProviderType(value: string): value is ProviderType {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value)
}

export function parseAgentLlmChoice(
  provider: string | undefined,
  model: string | undefined,
): AgentLlmChoice | null {
  const p = (provider ?? '').trim()
  const m = (model ?? '').trim()
  if (!p || !m || !isProviderType(p)) return null
  return { provider: p, model: m }
}

export function parseStageLlmOverrides(
  raw: string | undefined,
): Partial<Record<AgentLlmStage, AgentLlmChoice>> {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const out: Partial<Record<AgentLlmStage, AgentLlmChoice>> = {}
    for (const stage of AGENT_LLM_STAGES) {
      const entry = (parsed as Record<string, unknown>)[stage]
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const o = entry as Record<string, unknown>
      const choice = parseAgentLlmChoice(
        typeof o.provider === 'string' ? o.provider : undefined,
        typeof o.model === 'string' ? o.model : undefined,
      )
      if (choice) out[stage] = choice
    }
    return out
  } catch {
    return {}
  }
}

export function serializeStageLlmOverrides(
  stages: Partial<Record<AgentLlmStage, AgentLlmChoice>> | undefined,
): string {
  const trimmed: Partial<Record<AgentLlmStage, AgentLlmChoice>> = {}
  for (const stage of AGENT_LLM_STAGES) {
    const choice = stages?.[stage]
    if (choice?.provider && choice.model.trim()) {
      trimmed[stage] = {
        provider: choice.provider,
        model: choice.model.trim(),
      }
    }
  }
  return JSON.stringify(trimmed)
}

export function parseAgentStageLlmSettings(args: {
  provider: string
  model: string
  routingMode?: string | null
  stageLlmJson?: string | null
}): AgentStageLlmSettings {
  const defaultChoice =
    parseAgentLlmChoice(args.provider, args.model) ?? {
      provider: 'ollama',
      model: '',
    }
  const mode: AgentLlmRoutingMode =
    args.routingMode === 'per_stage' ? 'per_stage' : 'unified'
  const stages = parseStageLlmOverrides(args.stageLlmJson ?? undefined)
  return {
    mode,
    default: defaultChoice,
    ...(Object.keys(stages).length > 0 ? { stages } : {}),
  }
}

export function resolveStageLlmChoice(
  settings: AgentStageLlmSettings,
  stage: AgentLlmStage,
): AgentLlmChoice {
  if (settings.mode === 'per_stage') {
    const override = settings.stages?.[stage]
    if (override?.provider && override.model.trim()) {
      return override
    }
  }
  return settings.default
}

export function hasToolLoopRecoveryOverride(
  stages: Partial<Record<AgentLlmStage, AgentLlmChoice>> | undefined,
): boolean {
  const recovery = stages?.toolLoopRecovery
  return Boolean(recovery?.provider && recovery.model.trim())
}

/**
 * Provider/model for a tool-loop run. Uses `toolLoopRecovery` when configured and
 * the attempt is a recovery (retry after failure or manual-intervention follow-up).
 */
export function resolveToolLoopExecutionChoice(
  settings: AgentStageLlmSettings,
  isRecoveryAttempt: boolean,
): AgentLlmChoice {
  if (isRecoveryAttempt && hasToolLoopRecoveryOverride(settings.stages)) {
    return settings.stages!.toolLoopRecovery!
  }
  return resolveStageLlmChoice(settings, 'toolLoop')
}
