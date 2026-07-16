import { computed, type Ref } from 'vue'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import type { AgentLlmProviderOptions } from '@shared/agent/stage-llm-settings'
import {
  readReasoningUiValues,
  reasoningProviderProfile,
  writeReasoningUiValues,
  type LlmReasoningLevel,
  type LlmReasoningUiValues,
} from '@shared/agent/llm-provider-options'

/**
 * Product-facing reasoning controls. Callers never deal with AI SDK
 * `providerOptions` property names (`reasoningEffort`, `thinkingConfig`, …).
 */
export type AbstractReasoningSettings = {
  strength: LlmReasoningLevel | undefined
  showThinking: boolean
  thinkingTokenBudget: number | undefined
}

export type AbstractReasoningFieldSupport = {
  strength: boolean
  showThinking: boolean
  thinkingTokenBudget: boolean
}

const LEVEL_LABEL_KEYS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

export type ReasoningStrengthLabelKey = (typeof LEVEL_LABEL_KEYS)[number]

function toAbstract(values: LlmReasoningUiValues): AbstractReasoningSettings {
  return {
    strength: values.level,
    showThinking: values.includeThoughts === true,
    thinkingTokenBudget: values.thinkingBudget,
  }
}

function fromAbstract(
  settings: AbstractReasoningSettings,
): LlmReasoningUiValues {
  const values: LlmReasoningUiValues = {}
  if (settings.strength) values.level = settings.strength
  if (settings.showThinking) values.includeThoughts = true
  if (settings.thinkingTokenBudget != null) {
    values.thinkingBudget = settings.thinkingTokenBudget
  }
  return values
}

export function useAbstractLlmReasoningSettings(args: {
  provider: Ref<ProviderType> | (() => ProviderType)
  providerOptions: Ref<AgentLlmProviderOptions | undefined> | (() => AgentLlmProviderOptions | undefined)
  onUpdate: (next: AgentLlmProviderOptions | undefined) => void
}) {
  const provider = computed(() =>
    typeof args.provider === 'function' ? args.provider() : args.provider.value,
  )
  const providerOptions = computed(() =>
    typeof args.providerOptions === 'function'
      ? args.providerOptions()
      : args.providerOptions.value,
  )

  const profile = computed(() => reasoningProviderProfile(provider.value))

  const support = computed((): AbstractReasoningFieldSupport => ({
    strength: true,
    showThinking: profile.value.includeThoughtsStyle !== 'none',
    thinkingTokenBudget: profile.value.budgetStyle !== 'none',
  }))

  const strengthOptions = computed((): LlmReasoningLevel[] => [
    ...profile.value.levelValues,
  ])

  const settings = computed((): AbstractReasoningSettings =>
    toAbstract(readReasoningUiValues(provider.value, providerOptions.value)),
  )

  function commit(next: AbstractReasoningSettings) {
    args.onUpdate(
      writeReasoningUiValues(
        provider.value,
        providerOptions.value,
        fromAbstract(next),
      ),
    )
  }

  function setStrength(strength: LlmReasoningLevel | undefined) {
    commit({ ...settings.value, strength })
  }

  function setShowThinking(showThinking: boolean) {
    commit({ ...settings.value, showThinking })
  }

  function setThinkingTokenBudget(thinkingTokenBudget: number | undefined) {
    commit({ ...settings.value, thinkingTokenBudget })
  }

  return {
    settings,
    support,
    strengthOptions,
    setStrength,
    setShowThinking,
    setThinkingTokenBudget,
  }
}

export function isReasoningStrengthLabelKey(
  value: string,
): value is ReasoningStrengthLabelKey {
  return (LEVEL_LABEL_KEYS as readonly string[]).includes(value)
}
