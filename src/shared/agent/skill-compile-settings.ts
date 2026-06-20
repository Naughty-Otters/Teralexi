import {
  LLM_PROVIDER_IDS,
  LLM_PROVIDER_LABELS,
  llmProviderSettingsLabel,
  OPENAI_COMPATIBLE_LLM_PROVIDERS,
  type ProviderType,
} from './llm-provider-registry'

/** System config keys for skill compilation LLM (`config.properties`). */

export const SKILL_COMPILE_PROP_KEYS = {
  perSkillOverrides: 'settings.skillCompile.perSkillOverrides',
} as const

export const SKILL_COMPILE_PROVIDERS = [...LLM_PROVIDER_IDS] as const

export type SkillCompileProvider = (typeof SKILL_COMPILE_PROVIDERS)[number]

export type SkillCompileLlmChoice = {
  provider: SkillCompileProvider
  model: string
}

export type SkillCompilePerSkillOverrides = Record<
  string,
  SkillCompileLlmChoice
>

export type SkillCompileSettings = {
  perSkill: SkillCompilePerSkillOverrides
}

export type SkillCompileLlmSource = 'skill_properties' | 'per_skill'

export type ResolvedSkillCompileLlm = SkillCompileLlmChoice & {
  source: SkillCompileLlmSource
}

export const SKILL_COMPILE_PROVIDER_LABELS: Record<
  SkillCompileProvider,
  string
> = Object.fromEntries(
  LLM_PROVIDER_IDS.map((id) => [id, llmProviderSettingsLabel(id)]),
) as Record<SkillCompileProvider, string>

function isSkillCompileProvider(
  value: string,
): value is SkillCompileProvider {
  return (SKILL_COMPILE_PROVIDERS as readonly string[]).includes(value)
}

export function parseSkillCompileLlmChoice(
  provider: string | undefined,
  model: string | undefined,
): SkillCompileLlmChoice | null {
  const p = (provider ?? '').trim()
  const m = (model ?? '').trim()
  if (!p || !m || !isSkillCompileProvider(p)) return null
  return { provider: p, model: m }
}

export function parseSkillCompilePerSkillOverrides(
  raw: string | undefined,
): SkillCompilePerSkillOverrides {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const out: SkillCompilePerSkillOverrides = {}
    for (const [skillId, entry] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const o = entry as Record<string, unknown>
      const choice = parseSkillCompileLlmChoice(
        typeof o.provider === 'string' ? o.provider : undefined,
        typeof o.model === 'string' ? o.model : undefined,
      )
      if (choice) out[skillId] = choice
    }
    return out
  } catch {
    return {}
  }
}

export function serializeSkillCompilePerSkillOverrides(
  overrides: SkillCompilePerSkillOverrides,
): string {
  const trimmed: SkillCompilePerSkillOverrides = {}
  for (const [skillId, choice] of Object.entries(overrides)) {
    if (choice.provider && choice.model.trim()) {
      trimmed[skillId] = {
        provider: choice.provider,
        model: choice.model.trim(),
      }
    }
  }
  return JSON.stringify(trimmed)
}

export function parseSkillCompileSettings(
  values: Record<string, string | undefined>,
): SkillCompileSettings {
  const perSkill = parseSkillCompilePerSkillOverrides(
    values[SKILL_COMPILE_PROP_KEYS.perSkillOverrides],
  )
  return { perSkill }
}

/** Default is properties.md; per-skill override when set in settings. */
export function resolveSkillCompileLlm(
  skillId: string,
  skillProperties: SkillCompileLlmChoice,
  settings: SkillCompileSettings,
): ResolvedSkillCompileLlm {
  const perSkill = settings.perSkill[skillId]
  if (perSkill) {
    return { ...perSkill, source: 'per_skill' }
  }
  return { ...skillProperties, source: 'skill_properties' }
}

export function defaultModelsForProvider(provider: ProviderType): readonly string[] {
  if (provider in OPENAI_COMPATIBLE_LLM_PROVIDERS) {
    return OPENAI_COMPATIBLE_LLM_PROVIDERS[
      provider as keyof typeof OPENAI_COMPATIBLE_LLM_PROVIDERS
    ].defaultModels
  }
  return []
}
