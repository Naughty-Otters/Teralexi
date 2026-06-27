<template>
  <div class="onboarding-agents">
    <p class="onboarding-agents-intro">{{ ps.wizard.agentsSubtitle }}</p>

    <div class="onboarding-agents-bulk sp-card">
      <div class="onboarding-agents-bulk-label">{{ ps.wizard.applyToAll }}</div>
      <div class="onboarding-agents-bulk-fields">
        <div class="onboarding-agents-field">
          <label class="onboarding-agents-field-label">{{ p.fields.provider }}</label>
          <LlmProviderSelect
            :model-value="bulkProvider"
            :provider-ids="configuredProviderIds"
            @update:model-value="onBulkProviderChange"
          />
        </div>
        <div class="onboarding-agents-field">
          <label class="onboarding-agents-field-label">{{ p.fields.model }}</label>
          <LlmModelSelect
            v-if="bulkModels.length > 0"
            :model-value="bulkModel"
            :models="bulkModels"
            @update:model-value="bulkModel = $event"
          />
          <input
            v-else
            v-model="bulkModel"
            class="onboarding-agents-input"
            placeholder="e.g. gpt-4o"
          />
        </div>
        <button
          type="button"
          class="onboarding-agents-apply-btn"
          :disabled="!canApplyBulk"
          @click="applyBulk"
        >
          {{ ps.wizard.applyToAll }}
        </button>
      </div>
    </div>

    <div class="onboarding-editor-ai sp-card">
      <div class="onboarding-agents-bulk-label">{{ ps.wizard.editorAiTitle }}</div>
      <p class="onboarding-editor-ai-desc">{{ ps.wizard.editorAiSubtitle }}</p>
      <EditorAiCompletionFields
        v-model="editorAiSettings"
        variant="wizard"
        :provider-ids="editorAiProviderIds"
        :labels="editorAiLabels"
      />
    </div>

    <div class="onboarding-agents-list">
      <div
        v-for="agent in agentStore.agents"
        :key="agent.id"
        class="onboarding-agents-row sp-card"
        :class="{ 'onboarding-agents-row--ok': isAgentReady(agent) }"
      >
        <div class="onboarding-agents-row-head">
          <UAvatar :alt="agent.name" :color="agent.color" size="xs" />
          <span class="onboarding-agents-row-name">{{ agent.name }}</span>
          <UIcon
            v-if="isAgentReady(agent)"
            name="i-lucide-check-circle-2"
            class="onboarding-agents-row-status onboarding-agents-row-status--ok"
          />
          <UIcon
            v-else
            name="i-lucide-alert-circle"
            class="onboarding-agents-row-status onboarding-agents-row-status--warn"
          />
        </div>
        <div class="onboarding-agents-row-fields">
          <div class="onboarding-agents-field">
            <label class="onboarding-agents-field-label">{{ p.fields.provider }}</label>
            <LlmProviderSelect
              :model-value="agent.provider"
              :provider-ids="configuredProviderIds"
              @update:model-value="onAgentProviderChange(agent.id, $event)"
            />
          </div>
          <div class="onboarding-agents-field">
            <label class="onboarding-agents-field-label">{{ p.fields.model }}</label>
            <LlmModelSelect
              v-if="modelsForAgent(agent).length > 0"
              :model-value="agent.model"
              :models="modelsForAgent(agent)"
              @update:model-value="agentStore.updateAgentModel(agent.id, $event)"
            />
            <input
              v-else
              class="onboarding-agents-input"
              :value="agent.model"
              placeholder="e.g. gpt-4o"
              @change="
                agentStore.updateAgentModel(
                  agent.id,
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
          </div>
        </div>
      </div>
    </div>

    <p
      class="onboarding-agents-footer-msg"
      :class="
        allReady
          ? 'onboarding-agents-footer-msg--ok'
          : 'onboarding-agents-footer-msg--warn'
      "
    >
      {{ allReady ? ps.wizard.allAgentsReady : ps.wizard.agentsIncomplete }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useAgentStore, type Agent, type ProviderType } from '@store/agent'
import { isAgentReadyForOnboarding } from '@shared/agent/onboarding-status'
import {
  DEFAULT_EDITOR_AI_COMPLETION_SETTINGS,
  EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS,
  parseEditorAiCompletionProvider,
  parseEditorAiCompletionSettings,
  type EditorAiCompletionProvider,
  type EditorAiCompletionSettings,
} from '@shared/editor/editor-ai-completion-settings'
import { getSystemConfigValues } from '@store/agent/config'
import EditorAiCompletionFields from '@renderer/components/code/EditorAiCompletionFields.vue'
import { persistEditorAiCompletionSettings } from '@renderer/components/code/editor-ai-completion-persist'
import LlmProviderSelect from './settings/LlmProviderSelect.vue'
import LlmModelSelect from './settings/LlmModelSelect.vue'

const props = defineProps<{
  defaultProvider: ProviderType | null
  defaultModel?: string
}>()

const { t, p } = useI18n()
const ps = computed(() => t.value.providerSetup)
const agentStore = useAgentStore()

const bulkProvider = ref<ProviderType>(
  props.defaultProvider ?? agentStore.configuredLlmProviderIds[0] ?? 'openai',
)
const bulkModel = ref('')
const editorAiSettings = ref<EditorAiCompletionSettings>({
  ...DEFAULT_EDITOR_AI_COMPLETION_SETTINGS,
})

const configuredProviderIds = computed(() => agentStore.configuredLlmProviderIds)

const editorAiProviderIds = computed((): readonly EditorAiCompletionProvider[] => {
  const configured = new Set(configuredProviderIds.value)
  const supported = EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS.filter((id) =>
    configured.has(id),
  )
  return supported.length > 0 ? supported : [...EDITOR_AI_COMPLETION_SUPPORTED_PROVIDERS]
})

const editorAiLabels = computed(() => ({
  enabledTitle: ps.value.wizard.editorAiEnabled,
  enabledDesc: ps.value.wizard.editorAiEnabledDesc,
  providerTitle: p.value.fields.provider,
  modelTitle: p.value.fields.model,
  modelDesc: ps.value.wizard.editorAiModelDesc,
}))

const bulkModels = computed(
  () => agentStore.availableModelsByProvider[bulkProvider.value] ?? [],
)

const canApplyBulk = computed(
  () => bulkProvider.value && bulkModel.value.trim().length > 0,
)

const allReady = computed(() => agentStore.areAllAgentsLlmReady)

watch(
  () => props.defaultProvider,
  (provider) => {
    if (provider) bulkProvider.value = provider
  },
)

watch(
  () => [props.defaultProvider, props.defaultModel, bulkModels.value] as const,
  ([provider, model, models]) => {
    if (model?.trim()) {
      bulkModel.value = model.trim()
      return
    }
    if (models.length > 0) {
      bulkModel.value = models[0] ?? ''
      return
    }
    if (provider && agentStore.agents.length > 0) {
      const sample = agentStore.agents.find((a) => a.provider === provider)
      if (sample?.model.trim()) bulkModel.value = sample.model.trim()
    }
  },
  { immediate: true },
)

watch(bulkProvider, (provider) => {
  void agentStore.fetchModelsForProvider(provider)
  const models = agentStore.availableModelsByProvider[provider] ?? []
  if (models.length > 0 && !models.includes(bulkModel.value)) {
    bulkModel.value = models[0] ?? ''
  }
})

function applyEditorAiDefaults(provider: ProviderType | null, model?: string): void {
  if (!provider) return
  const parsedProvider = parseEditorAiCompletionProvider(provider)
  if (!editorAiProviderIds.value.includes(parsedProvider)) return

  const models = agentStore.availableModelsByProvider[provider] ?? []
  const nextModel = model?.trim() || models[0] || editorAiSettings.value.model
  editorAiSettings.value = {
    ...editorAiSettings.value,
    enabled: true,
    provider: parsedProvider,
    model: nextModel,
  }
}

watch(
  () => [props.defaultProvider, props.defaultModel] as const,
  ([provider, model]) => {
    applyEditorAiDefaults(provider, model)
  },
)

async function loadEditorAiSettings(): Promise<void> {
  const values = await getSystemConfigValues([
    'editor.settings.aiCompletionEnabled',
    'editor.settings.aiCompletionProvider',
    'editor.settings.aiCompletionModel',
    'editor.settings.aiCompletionDebounceMs',
    'editor.settings.aiCompletionMaxTokens',
  ])
  editorAiSettings.value = parseEditorAiCompletionSettings(values)
  if (!editorAiSettings.value.model.trim()) {
    applyEditorAiDefaults(props.defaultProvider, props.defaultModel)
  }
}

async function saveEditorAiSettings(): Promise<void> {
  await persistEditorAiCompletionSettings(editorAiSettings.value)
}

onMounted(() => {
  void loadEditorAiSettings()
})

function buildCreds() {
  return {
    ollamaReachable: agentStore.connectionStatus === 'connected',
    llamacppReachable: agentStore.llamacppConnectionStatus === 'connected',
    openaiApiKey: agentStore.openaiApiKey,
    anthropicApiKey: agentStore.anthropicApiKey,
    geminiApiKey: agentStore.geminiApiKey,
    deepseekApiKey: agentStore.deepseekApiKey,
    zhipuApiKey: agentStore.zhipuApiKey,
    openAiCompatible: agentStore.openAiCompatibleApiKeys,
  }
}

function isAgentReady(agent: Agent): boolean {
  return isAgentReadyForOnboarding(
    {
      provider: agent.provider,
      model: agent.model,
      llmRoutingMode: agent.llmRoutingMode,
      stageLlm: agent.stageLlm,
    },
    buildCreds(),
  )
}

function modelsForAgent(agent: Agent): string[] {
  return agentStore.availableModelsByProvider[agent.provider] ?? []
}

function onBulkProviderChange(provider: ProviderType) {
  bulkProvider.value = provider
}

function onAgentProviderChange(agentId: string, provider: ProviderType) {
  agentStore.updateAgentProvider(agentId, provider)
  const models = agentStore.availableModelsByProvider[provider] ?? []
  const agent = agentStore.agents.find((a) => a.id === agentId)
  if (models.length > 0 && agent && !models.includes(agent.model)) {
    agentStore.updateAgentModel(agentId, models[0] ?? '')
  }
}

function applyBulk() {
  if (!canApplyBulk.value) return
  agentStore.applyLlmDefaultsToAllAgents(bulkProvider.value, bulkModel.value)
}

defineExpose({
  allReady,
  saveEditorAiSettings,
})
</script>

<style scoped>
.onboarding-agents-intro {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.onboarding-agents-bulk {
  margin-bottom: 14px;
  padding: 14px;
  position: relative;
}

.onboarding-editor-ai {
  margin-bottom: 14px;
  padding: 14px;
  position: relative;
}

.onboarding-editor-ai:has(.llm-provider-select--open),
.onboarding-editor-ai:has(.llm-model-select--open) {
  z-index: 40;
}

.onboarding-editor-ai-desc {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.onboarding-agents-bulk:has(.llm-provider-select--open),
.onboarding-agents-bulk:has(.llm-model-select--open) {
  z-index: 40;
}

.onboarding-agents-bulk-label {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--ui-text);
}

.onboarding-agents-bulk-fields {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  align-items: end;
}

@media (max-width: 560px) {
  .onboarding-agents-bulk-fields {
    grid-template-columns: 1fr;
  }
}

.onboarding-agents-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.onboarding-agents-row {
  padding: 12px 14px;
  position: relative;
}

.onboarding-agents-row:has(.llm-provider-select--open),
.onboarding-agents-row:has(.llm-model-select--open) {
  z-index: 40;
}

.onboarding-agents-row--ok {
  border-color: color-mix(in srgb, var(--color-success-500, #22c55e) 35%, var(--ui-border));
}

.onboarding-agents-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.onboarding-agents-row-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.onboarding-agents-row-status {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.onboarding-agents-row-status--ok {
  color: var(--color-success-600, #16a34a);
}

.onboarding-agents-row-status--warn {
  color: var(--color-warning-600, #ca8a04);
}

.onboarding-agents-row-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 560px) {
  .onboarding-agents-row-fields {
    grid-template-columns: 1fr;
  }
}

.onboarding-agents-field {
  min-width: 0;
}

.onboarding-agents-field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.onboarding-agents-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: inherit;
}

.onboarding-agents-apply-btn {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 8%, var(--ui-bg));
  color: var(--color-primary-600, var(--color-primary-500));
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}

.onboarding-agents-apply-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.onboarding-agents-footer-msg {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.45;
}

.onboarding-agents-footer-msg--ok {
  color: var(--color-success-600, #16a34a);
}

.onboarding-agents-footer-msg--warn {
  color: var(--color-warning-700, #a16207);
}
</style>
