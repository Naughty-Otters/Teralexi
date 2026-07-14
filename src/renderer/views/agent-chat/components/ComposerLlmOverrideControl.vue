<template>
  <div ref="rootEl" class="clo">
    <AppIconTooltip :text="triggerTooltip">
      <button
        ref="triggerRef"
        type="button"
        class="clo-trigger"
        :class="{ 'clo-trigger--on': menuOpen || hasOverride }"
        :aria-label="triggerTooltip"
        :aria-expanded="menuOpen"
        aria-haspopup="dialog"
        :disabled="disabled"
        @mousedown.prevent
        @click="toggleMenu"
      >
        <UIcon name="i-lucide-sparkles" />
      </button>
    </AppIconTooltip>
    <Teleport to="body">
      <div
        v-if="menuOpen"
        ref="menuRef"
        class="clo-menu"
        :style="menuStyle"
        role="dialog"
        aria-label="Override model"
        @pointerdown.stop
      >
        <label class="clo-toggle">
          <input
            type="checkbox"
            :checked="overrideEnabled"
            :disabled="disabled"
            @change="onOverrideToggle"
          />
          <span class="clo-toggle-copy">
            <span class="clo-toggle-title">Override agent model</span>
            <span class="clo-toggle-hint">
              {{
                overrideEnabled
                  ? `${effectiveProvider} · ${effectiveModel || 'pick a model'}`
                  : 'Using agent default'
              }}
            </span>
          </span>
        </label>

        <template v-if="overrideEnabled">
          <div class="clo-field">
            <span class="clo-label">Provider</span>
            <LlmProviderSelect
              :model-value="effectiveProvider"
              :disabled="disabled"
              prefetch-models
              @update:model-value="onProviderChange"
            />
          </div>
          <div class="clo-field">
            <span class="clo-label">Model</span>
            <LlmModelSelect
              v-if="availableModels.length > 0"
              :model-value="effectiveModel"
              :models="availableModels"
              :disabled="disabled"
              @update:model-value="onModelChange"
            />
            <input
              v-else
              class="clo-input"
              :value="effectiveModel"
              :disabled="disabled"
              placeholder="e.g. llama3.2"
              @input="onModelInput"
            />
          </div>
          <AgentLlmReasoningSettings
            variant="composer"
            :provider="effectiveProvider"
            :provider-options="draft?.providerOptions"
            :disabled="disabled"
            @update:provider-options="onProviderOptionsChange"
          />
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIconTooltip from '@renderer/components/AppIconTooltip.vue'
import type { ConversationLlmOverride } from '@shared/agent/conversation-llm-override'
import {
  LLM_PROVIDER_SETTINGS_OPTIONS,
  type ProviderType,
} from '@shared/agent/llm-provider-registry'
import type { AgentLlmProviderOptions } from '@shared/agent/stage-llm-settings'
import { useAgentStore } from '@store/agent'
import LlmProviderSelect from './settings/LlmProviderSelect.vue'
import LlmModelSelect from './settings/LlmModelSelect.vue'
import AgentLlmReasoningSettings from './settings/AgentLlmReasoningSettings.vue'

const props = defineProps<{
  modelValue: ConversationLlmOverride | null
  agentProvider: ProviderType
  agentModel: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ConversationLlmOverride | null): void
  (e: 'menu-open-change', open: boolean): void
}>()

const agentStore = useAgentStore()
const rootEl = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuStyle = ref<Record<string, string>>({})

const draft = ref<{
  provider: ProviderType
  model: string
  providerOptions?: AgentLlmProviderOptions
} | null>(null)

const hasOverride = computed(() => props.modelValue != null)
const overrideEnabled = computed(() => hasOverride.value)

const configuredProviderIds = computed((): ProviderType[] => {
  const configured = new Set(agentStore.configuredLlmProviderIds)
  if (isConfiguredProvider(effectiveProvider.value)) {
    configured.add(effectiveProvider.value)
  }
  const ids = LLM_PROVIDER_SETTINGS_OPTIONS.map((o) => o.id).filter((id) =>
    configured.has(id),
  )
  return ids.length > 0 ? ids : LLM_PROVIDER_SETTINGS_OPTIONS.map((o) => o.id)
})

function isConfiguredProvider(provider: ProviderType): boolean {
  return (agentStore.configuredLlmProviderIds as readonly string[]).includes(
    provider,
  )
}

function syncDraftFromProps() {
  if (props.modelValue) {
    draft.value = {
      provider: props.modelValue.provider,
      model: props.modelValue.model,
      ...(props.modelValue.providerOptions
        ? { providerOptions: { ...props.modelValue.providerOptions } }
        : {}),
    }
    return
  }
  draft.value = null
}

const effectiveProvider = computed(
  (): ProviderType =>
    draft.value?.provider ?? props.modelValue?.provider ?? props.agentProvider,
)

const effectiveModel = computed(
  () => draft.value?.model ?? props.modelValue?.model ?? props.agentModel,
)

const availableModels = computed(
  () => agentStore.availableModelsByProvider[effectiveProvider.value] ?? [],
)

const triggerTooltip = computed(() => {
  if (!props.modelValue) return 'Override model'
  return `Override on · ${props.modelValue.provider} · ${props.modelValue.model}`
})

function commitDraft(
  next: {
    provider: ProviderType
    model: string
    providerOptions?: AgentLlmProviderOptions
  } | null,
) {
  draft.value = next
  if (!next?.provider || !next.model.trim()) {
    if (next == null) emit('update:modelValue', null)
    return
  }
  const payload: ConversationLlmOverride = {
    provider: next.provider,
    model: next.model.trim(),
  }
  if (next.providerOptions) {
    payload.providerOptions = JSON.parse(
      JSON.stringify(next.providerOptions),
    ) as AgentLlmProviderOptions
  }
  emit('update:modelValue', payload)
}

function pickModelForProvider(
  provider: ProviderType,
  preferred?: string,
): string {
  const models = agentStore.availableModelsByProvider[provider] ?? []
  const preferredTrimmed = preferred?.trim() ?? ''
  if (
    preferredTrimmed &&
    (models.length === 0 || models.includes(preferredTrimmed))
  ) {
    return preferredTrimmed
  }
  return models[0] ?? preferredTrimmed
}

function onOverrideToggle(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  if (!enabled) {
    commitDraft(null)
    return
  }
  const provider =
    props.agentProvider && isConfiguredProvider(props.agentProvider)
      ? props.agentProvider
      : (configuredProviderIds.value[0] ?? props.agentProvider)
  const model = pickModelForProvider(
    provider,
    provider === props.agentProvider ? props.agentModel : undefined,
  )
  commitDraft({ provider, model })
  void ensureModelsLoaded(provider)
}

async function ensureModelsLoaded(provider: ProviderType) {
  await agentStore.fetchModelsForProvider(provider)
  if (!draft.value || draft.value.provider !== provider) return
  const models = agentStore.availableModelsByProvider[provider] ?? []
  if (models.length === 0) return
  if (models.includes(draft.value.model)) return
  commitDraft({
    provider,
    model: models[0],
    ...(draft.value.providerOptions
      ? { providerOptions: draft.value.providerOptions }
      : {}),
  })
}

function onProviderChange(provider: ProviderType) {
  commitDraft({
    provider,
    model: pickModelForProvider(provider),
  })
  void ensureModelsLoaded(provider)
}

function onModelChange(model: string) {
  commitDraft({
    provider: effectiveProvider.value,
    model,
    ...(draft.value?.providerOptions
      ? { providerOptions: draft.value.providerOptions }
      : {}),
  })
}

function onModelInput(event: Event) {
  onModelChange((event.target as HTMLInputElement).value)
}

function onProviderOptionsChange(
  providerOptions: AgentLlmProviderOptions | undefined,
) {
  commitDraft({
    provider: effectiveProvider.value,
    model: effectiveModel.value,
    ...(providerOptions ? { providerOptions } : {}),
  })
}

function positionMenu() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const gap = 6
  const width = 320
  let left = rect.left
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8)
  }
  menuStyle.value = {
    position: 'fixed',
    top: 'auto',
    bottom: `${window.innerHeight - rect.top + gap}px`,
    left: `${left}px`,
    width: `${width}px`,
    zIndex: '10050',
  }
}

async function openMenu() {
  syncDraftFromProps()
  menuOpen.value = true
  emit('menu-open-change', true)
  if (props.modelValue) {
    void ensureModelsLoaded(props.modelValue.provider)
  }
  await nextTick()
  positionMenu()
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  emit('menu-open-change', false)
}

function toggleMenu() {
  if (props.disabled) return
  if (menuOpen.value) closeMenu()
  else void openMenu()
}

function onDocPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return
  const target = event.target as Node | null
  if (!target) return
  if (rootEl.value?.contains(target)) return
  if (menuRef.value?.contains(target)) return
  closeMenu()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value) {
    event.preventDefault()
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', positionMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', positionMenu)
})

watch(
  () => props.modelValue,
  () => {
    if (!menuOpen.value) syncDraftFromProps()
  },
)
</script>

<style scoped>
.clo {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.clo-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 0;
  box-shadow: none;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
}

.clo-trigger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
  color: var(--ui-text);
}

.clo-trigger:disabled {
  color: color-mix(in srgb, var(--ui-text-muted) 45%, transparent);
  opacity: 0.45;
  cursor: not-allowed;
}

/* Color only — no fill. Matches other toolbar icons (no permanent bg). */
.clo-trigger--on {
  color: var(--color-primary-500, var(--ui-text));
  background: transparent;
}

.clo-menu {
  background: var(--ui-bg-elevated, var(--ui-bg));
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.clo-toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-text) 4%, transparent);
  cursor: pointer;
}

.clo-toggle input {
  margin-top: 2px;
}

.clo-toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.clo-toggle-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text);
}

.clo-toggle-hint {
  font-size: 11px;
  color: var(--ui-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clo-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.clo-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  letter-spacing: 0.04em;
}

.clo-input {
  width: 100%;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--ui-text);
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}
</style>
