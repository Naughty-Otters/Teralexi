<template>
  <div class="alrs">
    <div class="alrs-header">
      <span class="alrs-title">{{ p.agents.reasoningSettings }}</span>
      <p
        v-if="variant !== 'composer'"
        class="alrs-hint"
      >
        {{ p.agents.reasoningSettingsHint }}
      </p>
    </div>
    <ul class="alrs-list">
      <li
        v-for="field in fields"
        :key="field.id"
        class="alrs-item"
      >
        <label
          v-if="field.kind !== 'checkbox'"
          class="alrs-label"
          :for="field.inputId"
        >
          {{ field.label }}
        </label>
        <select
          v-if="field.kind === 'select'"
          :id="field.inputId"
          class="aft-input aft-select"
          :value="settings.strength ?? ''"
          :disabled="disabled || !support.strength"
          @change="onStrengthChange"
        >
          <option value="">
            {{ p.agents.reasoningDefault }}
          </option>
          <option
            v-for="level in strengthSelectOptions"
            :key="level"
            :value="level"
          >
            {{ strengthLabel(level) }}
          </option>
        </select>
        <input
          v-else-if="field.kind === 'number'"
          :id="field.inputId"
          class="aft-input"
          type="number"
          min="0"
          step="1"
          :value="budgetText"
          :disabled="disabled"
          :placeholder="p.agents.thinkingBudgetPlaceholder"
          @input="onBudgetInput"
        />
        <label
          v-else
          class="alrs-check"
          :for="field.inputId"
        >
          <input
            :id="field.inputId"
            type="checkbox"
            :checked="settings.showThinking"
            :disabled="disabled"
            @change="onShowThinkingChange"
          />
          <span>{{ field.label }}</span>
        </label>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef, useId } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import type { ProviderType } from '@store/agent'
import type { AgentLlmProviderOptions } from '@shared/agent/stage-llm-settings'
import type { LlmReasoningLevel } from '@shared/agent/llm-provider-options'
import {
  isReasoningStrengthLabelKey,
  useAbstractLlmReasoningSettings,
} from './useAbstractLlmReasoningSettings'
import './sp-shared.css'

const props = withDefaults(
  defineProps<{
    provider: ProviderType
    providerOptions?: AgentLlmProviderOptions
    disabled?: boolean
    /** Agent settings keep thinking budget; composer omits budget. */
    variant?: 'full' | 'composer'
  }>(),
  {
    variant: 'full',
  },
)

const emit = defineEmits<{
  (e: 'update:providerOptions', value: AgentLlmProviderOptions | undefined): void
}>()

const { p } = useI18n()
const idPrefix = useId()

const {
  settings,
  support,
  strengthOptions,
  setStrength,
  setShowThinking,
  setThinkingTokenBudget,
} = useAbstractLlmReasoningSettings({
  provider: toRef(props, 'provider'),
  providerOptions: toRef(props, 'providerOptions'),
  onUpdate: (next) => emit('update:providerOptions', next),
})

const budgetText = computed(() =>
  settings.value.thinkingTokenBudget != null
    ? String(settings.value.thinkingTokenBudget)
    : '',
)

const strengthSelectOptions = computed(() =>
  strengthOptions.value.filter((level) => level !== 'none'),
)

type ReasoningFormField = {
  id: 'strength' | 'thinkingTokenBudget' | 'showThinking'
  kind: 'select' | 'number' | 'checkbox'
  label: string
  inputId: string
}

const fields = computed((): ReasoningFormField[] => {
  const next: ReasoningFormField[] = [
    {
      id: 'strength',
      kind: 'select',
      label: p.value.agents.reasoningStrength,
      inputId: `${idPrefix}-strength`,
    },
  ]

  if (props.variant === 'full' && support.value.thinkingTokenBudget) {
    next.push({
      id: 'thinkingTokenBudget',
      kind: 'number',
      label: p.value.agents.thinkingBudget,
      inputId: `${idPrefix}-budget`,
    })
  }

  if (support.value.showThinking) {
    next.push({
      id: 'showThinking',
      kind: 'checkbox',
      label: p.value.agents.showThinking,
      inputId: `${idPrefix}-show-thinking`,
    })
  }

  return next
})

function strengthLabel(level: LlmReasoningLevel): string {
  const labels = p.value.agents.reasoningStrengthLevels
  if (isReasoningStrengthLabelKey(level) && labels[level]) return labels[level]
  return level
}

function onStrengthChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  setStrength(raw ? (raw as LlmReasoningLevel) : undefined)
}

function onBudgetInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  if (!raw) {
    setThinkingTokenBudget(undefined)
    return
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return
  setThinkingTokenBudget(Math.floor(n))
}

function onShowThinkingChange(event: Event) {
  setShowThinking((event.target as HTMLInputElement).checked)
}
</script>

<style scoped>
.alrs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.alrs-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.alrs-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
}

.alrs-hint {
  margin: 0;
  font-size: 11px;
  color: var(--ui-text-muted);
}

.alrs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.alrs-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.alrs-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
}

.alrs-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ui-text, inherit);
  cursor: pointer;
}

.aft-input {
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--ui-text);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.aft-input:focus {
  border-color: var(--color-primary-500);
}

.aft-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.aft-select {
  appearance: auto;
  cursor: pointer;
}
</style>
