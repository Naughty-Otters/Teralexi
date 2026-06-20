<template>
  <div class="alsp-row">
    <span class="alsp-label">{{ label }}</span>
    <LlmProviderSelect
      class="alsp-provider"
      :model-value="choice.provider"
      :disabled="disabled"
      @update:model-value="onProviderChange"
    />
    <LlmModelSelect
      v-if="availableModels.length > 0"
      class="alsp-model"
      :model-value="choice.model"
      :models="availableModels"
      :disabled="disabled"
      @update:model-value="onModelChange"
    />
    <input
      v-else
      class="aft-input alsp-model"
      :value="choice.model"
      :disabled="disabled"
      placeholder="e.g. llama3.2"
      @input="onModelInputChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProviderType } from '@store/agent'
import { useAgentStore } from '@store/agent'
import type { AgentLlmChoice } from '@shared/agent/stage-llm-settings'
import LlmProviderSelect from './LlmProviderSelect.vue'
import LlmModelSelect from './LlmModelSelect.vue'
import './sp-shared.css'

const props = defineProps<{
  label: string
  choice: AgentLlmChoice
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:choice', value: AgentLlmChoice): void
}>()

const agentStore = useAgentStore()

const availableModels = computed(
  () => agentStore.availableModelsByProvider[props.choice.provider] ?? [],
)

function onProviderChange(provider: ProviderType) {
  emit('update:choice', { provider, model: '' })
}

function onModelChange(model: string) {
  emit('update:choice', { ...props.choice, model })
}

function onModelInputChange(event: Event) {
  emit('update:choice', {
    ...props.choice,
    model: (event.target as HTMLInputElement).value,
  })
}
</script>

<style scoped>
.alsp-row {
  display: grid;
  grid-template-columns: 110px 1fr 1.4fr;
  gap: 8px;
  align-items: center;
}

.alsp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.alsp-provider,
.alsp-model {
  min-width: 0;
}
</style>
