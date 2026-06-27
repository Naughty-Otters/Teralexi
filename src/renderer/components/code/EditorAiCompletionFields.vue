<template>
  <div
    class="editor-ai-fields"
    :class="{ 'editor-ai-fields--wizard': variant === 'wizard' }"
  >
    <div v-if="showEnabled" class="editor-ai-fields-row">
      <div class="editor-ai-fields-text">
        <span class="editor-ai-fields-title">{{ labels.enabledTitle }}</span>
        <span v-if="labels.enabledDesc" class="editor-ai-fields-desc">{{
          labels.enabledDesc
        }}</span>
      </div>
      <label class="sp-toggle">
        <input
          type="checkbox"
          :checked="modelValue.enabled"
          :disabled="disabled"
          @change="patch({ enabled: ($event.target as HTMLInputElement).checked })"
        />
        <span
          class="sp-toggle-track"
          :class="{ 'sp-toggle-track--on': modelValue.enabled }"
        />
      </label>
    </div>

    <div class="editor-ai-fields-row">
      <div class="editor-ai-fields-text">
        <span class="editor-ai-fields-title">{{ labels.providerTitle }}</span>
        <span v-if="labels.providerDesc" class="editor-ai-fields-desc">{{
          labels.providerDesc
        }}</span>
      </div>
      <LlmProviderSelect
        class="editor-ai-fields-provider"
        :model-value="providerValue"
        :provider-ids="providerOptions"
        :disabled="disabled"
        @update:model-value="onProviderChange"
      />
    </div>

    <div class="editor-ai-fields-row">
      <div class="editor-ai-fields-text">
        <span class="editor-ai-fields-title">{{ labels.modelTitle }}</span>
        <span v-if="labels.modelDesc" class="editor-ai-fields-desc">{{
          labels.modelDesc
        }}</span>
      </div>
      <LlmModelSelect
        v-if="availableModels.length > 0"
        class="editor-ai-fields-model"
        :model-value="modelValue.model"
        :models="availableModels"
        :disabled="disabled"
        @update:model-value="patch({ model: $event })"
      />
      <input
        v-else
        class="sp-input editor-ai-fields-model-input"
        :value="modelValue.model"
        :disabled="disabled"
        placeholder="e.g. qwen2.5-coder:7b"
        @change="
          patch({ model: ($event.target as HTMLInputElement).value.trim() })
        "
      />
    </div>

    <template v-if="variant === 'settings'">
      <div class="editor-ai-fields-row">
        <div class="editor-ai-fields-text">
          <span class="editor-ai-fields-title">{{ labels.debounceTitle }}</span>
          <span v-if="labels.debounceDesc" class="editor-ai-fields-desc">{{
            labels.debounceDesc
          }}</span>
        </div>
        <input
          class="sp-input editor-ai-fields-number"
          type="number"
          min="200"
          max="3000"
          step="100"
          :value="modelValue.debounceMs"
          :disabled="disabled"
          @change="onDebounceChange"
        />
      </div>

      <div class="editor-ai-fields-row">
        <div class="editor-ai-fields-text">
          <span class="editor-ai-fields-title">{{ labels.maxTokensTitle }}</span>
          <span v-if="labels.maxTokensDesc" class="editor-ai-fields-desc">{{
            labels.maxTokensDesc
          }}</span>
        </div>
        <input
          class="sp-input editor-ai-fields-number"
          type="number"
          min="16"
          max="512"
          step="16"
          :value="modelValue.maxTokens"
          :disabled="disabled"
          @change="onMaxTokensChange"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import type { ProviderType } from '@store/agent'
import { useAgentStore } from '@store/agent'
import {
  DEFAULT_EDITOR_AI_COMPLETION_SETTINGS,
  EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS,
  parseEditorAiCompletionProvider,
  type EditorAiCompletionProvider,
  type EditorAiCompletionSettings,
} from '@shared/editor/editor-ai-completion-settings'
import LlmProviderSelect from '@renderer/views/agent-chat/components/settings/LlmProviderSelect.vue'
import LlmModelSelect from '@renderer/views/agent-chat/components/settings/LlmModelSelect.vue'
import '@renderer/views/agent-chat/components/settings/sp-shared.css'

const props = withDefaults(
  defineProps<{
    modelValue: EditorAiCompletionSettings
    disabled?: boolean
    variant?: 'settings' | 'wizard'
    showEnabled?: boolean
    /** When set, only these providers appear. */
    providerIds?: readonly EditorAiCompletionProvider[]
    labels?: Partial<{
      enabledTitle: string
      enabledDesc: string
      providerTitle: string
      providerDesc: string
      modelTitle: string
      modelDesc: string
      debounceTitle: string
      debounceDesc: string
      maxTokensTitle: string
      maxTokensDesc: string
    }>
  }>(),
  {
    disabled: false,
    variant: 'settings',
    showEnabled: true,
    providerIds: undefined,
    labels: () => ({}),
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: EditorAiCompletionSettings]
}>()

const agentStore = useAgentStore()

const defaultLabels = computed(() => ({
  enabledTitle: 'AI tab completion',
  enabledDesc:
    'Suggest inline code completions from your configured LLM provider while typing.',
  providerTitle: 'Completion provider',
  providerDesc: 'Uses the same API credentials as agent chat. Coder models work best.',
  modelTitle: 'Completion model',
  modelDesc: 'Pick a model from your provider. Coder models work best for FIM.',
  debounceTitle: 'Completion debounce (ms)',
  debounceDesc: 'Delay before requesting a suggestion after edits.',
  maxTokensTitle: 'Max completion tokens',
  maxTokensDesc: 'Upper bound on generated suggestion length.',
  ...props.labels,
}))

const labels = defaultLabels

const providerOptions = computed((): readonly ProviderType[] => {
  const supported = props.providerIds ?? EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS
  return supported as readonly ProviderType[]
})

const providerValue = computed(
  (): ProviderType => props.modelValue.provider as ProviderType,
)

const availableModels = computed(
  () => agentStore.availableModelsByProvider[providerValue.value] ?? [],
)

function patch(partial: Partial<EditorAiCompletionSettings>): void {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}

function onProviderChange(provider: ProviderType): void {
  const nextProvider = parseEditorAiCompletionProvider(provider)
  const models = agentStore.availableModelsByProvider[provider] ?? []
  const nextModel =
    models.includes(props.modelValue.model) && props.modelValue.model.trim()
      ? props.modelValue.model
      : (models[0] ?? '')
  patch({ provider: nextProvider, model: nextModel })
}

function onDebounceChange(event: Event): void {
  const raw = Number.parseInt((event.target as HTMLInputElement).value, 10)
  const next = Number.isFinite(raw)
    ? Math.min(3000, Math.max(200, raw))
    : props.modelValue.debounceMs
  patch({ debounceMs: next })
}

function onMaxTokensChange(event: Event): void {
  const raw = Number.parseInt((event.target as HTMLInputElement).value, 10)
  const next = Number.isFinite(raw)
    ? Math.min(512, Math.max(16, raw))
    : props.modelValue.maxTokens
  patch({ maxTokens: next })
}

async function ensureModelsLoaded(provider: ProviderType): Promise<void> {
  await agentStore.fetchModelsForProvider(provider)
}

watch(
  () => props.modelValue.provider,
  (provider) => {
    void ensureModelsLoaded(provider as ProviderType)
  },
  { immediate: true },
)

onMounted(() => {
  void ensureModelsLoaded(providerValue.value)
})

defineExpose({
  ensureModelsLoaded,
})
</script>

<style scoped>
.editor-ai-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-ai-fields--wizard {
  gap: 12px;
}

.editor-ai-fields:has(.llm-provider-select--open),
.editor-ai-fields:has(.llm-model-select--open) {
  position: relative;
  z-index: 40;
}

.editor-ai-fields-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.editor-ai-fields-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.editor-ai-fields-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.editor-ai-fields--wizard .editor-ai-fields-title {
  font-size: 12px;
}

.editor-ai-fields-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}

.editor-ai-fields--wizard .editor-ai-fields-desc {
  font-size: 12px;
}

.editor-ai-fields-provider,
.editor-ai-fields-model {
  width: 12rem;
  flex-shrink: 0;
}

.editor-ai-fields-model-input {
  width: 12rem;
  flex-shrink: 0;
}

.editor-ai-fields-number {
  width: 5rem;
  flex-shrink: 0;
}
</style>
