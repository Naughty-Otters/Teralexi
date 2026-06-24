<template>
  <div v-if="open" class="provider-setup-overlay" role="dialog" aria-modal="true">
    <div class="provider-setup-modal">
      <header class="provider-setup-header">
        <h2 class="provider-setup-title">{{ ps.wizard.title }}</h2>
        <p class="provider-setup-subtitle">{{ ps.wizard.subtitle }}</p>
      </header>

      <!-- Step: choose local vs cloud -->
      <div v-if="step === 'mode'" class="provider-setup-body">
        <p class="provider-setup-prompt">{{ ps.wizard.chooseMode }}</p>
        <div class="provider-setup-mode-grid">
          <button type="button" class="provider-setup-mode-card" @click="pickMode('local')">
            <span class="provider-setup-mode-title">{{ ps.wizard.localTitle }}</span>
            <span class="provider-setup-mode-desc">{{ ps.wizard.localDesc }}</span>
          </button>
          <button type="button" class="provider-setup-mode-card" @click="pickMode('cloud')">
            <span class="provider-setup-mode-title">{{ ps.wizard.cloudTitle }}</span>
            <span class="provider-setup-mode-desc">{{ ps.wizard.cloudDesc }}</span>
          </button>
        </div>
      </div>

      <!-- Step: pick provider -->
      <div v-else-if="step === 'provider'" class="provider-setup-body">
        <p class="provider-setup-prompt">{{ ps.wizard.pickProvider }}</p>
        <div class="provider-setup-provider-grid">
          <button
            v-for="id in providerChoices"
            :key="id"
            type="button"
            class="provider-setup-provider-chip"
            @click="selectProvider(id)"
          >
            {{ providerLabel(id) }}
          </button>
        </div>
      </div>

      <!-- Step: configure -->
      <div v-else class="provider-setup-body provider-setup-body--configure">
        <LlmProviderSetupCard
          v-if="selectedProvider"
          :provider="selectedProvider"
          @tested="onTested"
        />
      </div>

      <footer class="provider-setup-footer">
        <button
          v-if="step !== 'mode'"
          type="button"
          class="provider-setup-btn provider-setup-btn--ghost"
          @click="goBack"
        >
          {{ ps.wizard.back }}
        </button>
        <div class="provider-setup-footer-spacer" />
        <button
          type="button"
          class="provider-setup-btn provider-setup-btn--ghost"
          @click="skip"
        >
          {{ ps.wizard.skipForNow }}
        </button>
        <button
          v-if="step === 'configure' && setupVerified"
          type="button"
          class="provider-setup-btn provider-setup-btn--primary"
          @click="finish"
        >
          {{ ps.wizard.continue }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  CLOUD_LLM_PROVIDER_IDS,
  LOCAL_LLM_PROVIDER_IDS,
  type ProviderSetupCategory,
} from '@shared/agent/provider-setup-guides'
import {
  llmProviderSettingsLabel,
  type ProviderType,
} from '@shared/agent/llm-provider-registry'
import { useAgentStore } from '@store/agent'
import LlmProviderSetupCard from './settings/LlmProviderSetupCard.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  finished: []
}>()

const { t } = useI18n()
const ps = computed(() => t.value.providerSetup)
const agentStore = useAgentStore()

type WizardStep = 'mode' | 'provider' | 'configure'

const step = ref<WizardStep>('mode')
const mode = ref<ProviderSetupCategory>('cloud')
const selectedProvider = ref<ProviderType | null>(null)
const setupVerified = ref(false)

const providerChoices = computed(() =>
  mode.value === 'local' ? LOCAL_LLM_PROVIDER_IDS : CLOUD_LLM_PROVIDER_IDS,
)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      step.value = 'mode'
      mode.value = 'cloud'
      selectedProvider.value = null
      setupVerified.value = false
    }
  },
)

function providerLabel(id: ProviderType): string {
  return llmProviderSettingsLabel(id)
}

function pickMode(next: ProviderSetupCategory) {
  mode.value = next
  step.value = 'provider'
}

function selectProvider(id: ProviderType) {
  selectedProvider.value = id
  setupVerified.value = false
  step.value = 'configure'
}

function goBack() {
  if (step.value === 'configure') {
    step.value = 'provider'
    setupVerified.value = false
    return
  }
  if (step.value === 'provider') {
    step.value = 'mode'
  }
}

function onTested(payload: { ok: boolean }) {
  setupVerified.value = payload.ok
}

async function skip() {
  await agentStore.dismissProviderSetupWizard()
  emit('close')
}

async function finish() {
  await agentStore.dismissProviderSetupWizard()
  emit('finished')
  emit('close')
}
</script>

<style scoped>
.provider-setup-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: blur(4px);
}

.provider-setup-modal {
  width: min(560px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-elevated, var(--ui-bg));
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  box-shadow: 0 24px 48px rgb(0 0 0 / 0.2);
  overflow: hidden;
}

.provider-setup-header {
  padding: 20px 22px 12px;
  border-bottom: 1px solid var(--ui-border);
}

.provider-setup-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 650;
  color: var(--ui-text);
}

.provider-setup-subtitle {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

.provider-setup-body {
  padding: 16px 22px;
  overflow-y: auto;
  flex: 1;
}

.provider-setup-body--configure {
  padding-top: 12px;
}

.provider-setup-prompt {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}

.provider-setup-mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 480px) {
  .provider-setup-mode-grid {
    grid-template-columns: 1fr;
  }
}

.provider-setup-mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  text-align: left;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.12s, background 0.12s;
}

.provider-setup-mode-card:hover {
  border-color: var(--color-primary-500);
  background: color-mix(in srgb, var(--color-primary-500) 6%, var(--ui-bg));
}

.provider-setup-mode-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--ui-text);
}

.provider-setup-mode-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--ui-text-muted);
}

.provider-setup-provider-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.provider-setup-provider-chip {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text);
  cursor: pointer;
  font-family: inherit;
}

.provider-setup-provider-chip:hover {
  border-color: var(--color-primary-500);
  color: var(--color-primary-500);
}

.provider-setup-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px 16px;
  border-top: 1px solid var(--ui-border);
}

.provider-setup-footer-spacer {
  flex: 1;
}

.provider-setup-btn {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.provider-setup-btn--ghost {
  background: transparent;
  color: var(--ui-text-muted);
}

.provider-setup-btn--ghost:hover {
  color: var(--ui-text);
  background: var(--ui-bg-muted, rgb(0 0 0 / 0.04));
}

.provider-setup-btn--primary {
  background: var(--color-primary-500);
  color: #fff;
}

.provider-setup-btn--primary:hover {
  filter: brightness(1.05);
}
</style>
