import {
  LLM_PROVIDER_IDS,
  type ProviderType,
} from './llm-provider-registry'
import {
  isEmptyProviderOptions,
  parseProviderOptions,
  type AgentLlmProviderOptions,
} from './llm-provider-options'

export type { AgentLlmProviderOptions }

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
  /** AI SDK namespaced `providerOptions` for this choice. */
  providerOptions?: AgentLlmProviderOptions
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

/** Persisted next to stage overrides inside `stage_llm_json`. */
export const STAGE_LLM_DEFAULT_KEY = '_default'

function isProviderType(value: string): value is ProviderType {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value)
}

export function parseAgentLlmChoice(
  provider: string | undefined,
  model: string | undefined,
  providerOptions?: AgentLlmProviderOptions,
): AgentLlmChoice | null {
  const p = (provider ?? '').trim()
  const m = (model ?? '').trim()
  if (!p || !m || !isProviderType(p)) return null
  return {
    provider: p,
    model: m,
    ...(isEmptyProviderOptions(providerOptions)
      ? {}
      : { providerOptions }),
  }
}

export function parseAgentLlmChoiceFromObject(
  entry: unknown,
): AgentLlmChoice | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const o = entry as Record<string, unknown>
  return parseAgentLlmChoice(
    typeof o.provider === 'string' ? o.provider : undefined,
    typeof o.model === 'string' ? o.model : undefined,
    parseProviderOptions(o.providerOptions),
  )
}

export type StageLlmDocument = {
  defaultProviderOptions?: AgentLlmProviderOptions
  stages: Partial<Record<AgentLlmStage, AgentLlmChoice>>
}

export function parseStageLlmDocument(
  raw: string | undefined,
): StageLlmDocument {
  if (!raw?.trim()) return { stages: {} }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { stages: {} }
    }
    const root = parsed as Record<string, unknown>
    const stages: Partial<Record<AgentLlmStage, AgentLlmChoice>> = {}
    for (const stage of AGENT_LLM_STAGES) {
      const choice = parseAgentLlmChoiceFromObject(root[stage])
      if (choice) stages[stage] = choice
    }

    const defaultEntry = root[STAGE_LLM_DEFAULT_KEY]
    let defaultProviderOptions: AgentLlmProviderOptions | undefined
    if (
      defaultEntry &&
      typeof defaultEntry === 'object' &&
      !Array.isArray(defaultEntry)
    ) {
      defaultProviderOptions = parseProviderOptions(
        (defaultEntry as Record<string, unknown>).providerOptions,
      )
    }

    return {
      ...(defaultProviderOptions ? { defaultProviderOptions } : {}),
      stages,
    }
  } catch {
    return { stages: {} }
  }
}

export function parseStageLlmOverrides(
  raw: string | undefined,
): Partial<Record<AgentLlmStage, AgentLlmChoice>> {
  return parseStageLlmDocument(raw).stages
}

function serializeChoice(choice: AgentLlmChoice): Record<string, unknown> {
  const out: Record<string, unknown> = {
    provider: choice.provider,
    model: choice.model.trim(),
  }
  if (!isEmptyProviderOptions(choice.providerOptions)) {
    out.providerOptions = choice.providerOptions
  }
  return out
}

export function serializeStageLlmDocument(args: {
  defaultProviderOptions?: AgentLlmProviderOptions
  stages?: Partial<Record<AgentLlmStage, AgentLlmChoice>>
}): string {
  const trimmed: Record<string, unknown> = {}
  if (!isEmptyProviderOptions(args.defaultProviderOptions)) {
    trimmed[STAGE_LLM_DEFAULT_KEY] = {
      providerOptions: args.defaultProviderOptions,
    }
  }
  for (const stage of AGENT_LLM_STAGES) {
    const choice = args.stages?.[stage]
    if (choice?.provider && choice.model.trim()) {
      trimmed[stage] = serializeChoice(choice)
    }
  }
  return JSON.stringify(trimmed)
}

export function serializeStageLlmOverrides(
  stages: Partial<Record<AgentLlmStage, AgentLlmChoice>> | undefined,
  defaultProviderOptions?: AgentLlmProviderOptions,
): string {
  return serializeStageLlmDocument({
    defaultProviderOptions,
    stages,
  })
}

export function parseAgentStageLlmSettings(args: {
  provider: string
  model: string
  routingMode?: string | null
  stageLlmJson?: string | null
  defaultProviderOptions?: AgentLlmProviderOptions | null
}): AgentStageLlmSettings {
  const document = parseStageLlmDocument(args.stageLlmJson ?? undefined)
  const defaultProviderOptions =
    args.defaultProviderOptions ?? document.defaultProviderOptions
  const defaultChoice =
    parseAgentLlmChoice(
      args.provider,
      args.model,
      defaultProviderOptions,
    ) ?? {
      provider: 'ollama' as ProviderType,
      model: '',
      ...(isEmptyProviderOptions(defaultProviderOptions)
        ? {}
        : { providerOptions: defaultProviderOptions }),
    }
  const mode: AgentLlmRoutingMode =
    args.routingMode === 'per_stage' ? 'per_stage' : 'unified'
  const stages = document.stages
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
