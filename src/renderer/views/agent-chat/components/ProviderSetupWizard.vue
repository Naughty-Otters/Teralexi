<template>
  <div
    v-if="open"
    class="provider-setup-overlay"
    :class="{ 'provider-setup-overlay--page': firstRun }"
    role="dialog"
    aria-modal="true"
  >
    <div class="provider-setup-modal" :class="{ 'provider-setup-modal--page': firstRun }">
      <header class="provider-setup-header">
        <h2 class="provider-setup-title">
          {{ firstRun ? ps.wizard.rampUpTitle : ps.wizard.title }}
        </h2>
        <p class="provider-setup-subtitle">
          {{ firstRun ? ps.wizard.rampUpSubtitle : ps.wizard.subtitle }}
        </p>
        <div class="provider-setup-steps" aria-hidden="true">
          <span
            class="provider-setup-step"
            :class="{ 'provider-setup-step--active': phase === 'llm' }"
          >
            1. {{ ps.wizard.stepLlm }}
          </span>
          <span class="provider-setup-step-sep">→</span>
          <span
            class="provider-setup-step"
            :class="{ 'provider-setup-step--active': phase === 'agents' }"
          >
            2. {{ ps.wizard.stepAgents }}
          </span>
        </div>
      </header>

      <div v-if="phase === 'llm'">
        <!-- Already-configured providers -->
        <div v-if="llmStep === 'overview'" class="provider-setup-body">
          <p class="provider-setup-prompt">{{ ps.wizard.configuredProvidersHint }}</p>
          <div class="provider-setup-provider-grid">
            <button
              v-for="id in configuredProviderIds"
              :key="id"
              type="button"
              class="provider-setup-provider-chip provider-setup-provider-chip--configured"
              :class="{
                'provider-setup-provider-chip--selected': verifiedProvider === id,
              }"
              @click="selectConfiguredProvider(id)"
            >
              <UIcon
                name="i-lucide-check-circle-2"
                class="provider-setup-provider-chip-icon"
              />
              <span>{{ providerLabel(id) }}</span>
              <span class="provider-setup-provider-chip-badge">{{
                ps.wizard.alreadyConfigured
              }}</span>
            </button>
          </div>
          <button
            type="button"
            class="provider-setup-link-btn"
            @click="startAddProvider"
          >
            {{ ps.wizard.addAnotherProvider }}
          </button>
        </div>

        <!-- Step: choose local vs cloud -->
        <div v-else-if="llmStep === 'mode'" class="provider-setup-body">
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
        <div v-else-if="llmStep === 'provider'" class="provider-setup-body">
          <p class="provider-setup-prompt">{{ ps.wizard.pickProvider }}</p>
          <div class="provider-setup-provider-grid">
            <button
              v-for="id in providerChoices"
              :key="id"
              type="button"
              class="provider-setup-provider-chip"
              :class="{
                'provider-setup-provider-chip--configured': isProviderConfigured(id),
              }"
              @click="selectProvider(id)"
            >
              <UIcon
                v-if="isProviderConfigured(id)"
                name="i-lucide-check-circle-2"
                class="provider-setup-provider-chip-icon"
              />
              <span>{{ providerLabel(id) }}</span>
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
      </div>

      <div v-else class="provider-setup-body provider-setup-body--configure">
        <h3 class="provider-setup-agents-heading">{{ ps.wizard.agentsTitle }}</h3>
        <OnboardingAgentSetupStep
          ref="agentsStepRef"
          :default-provider="verifiedProvider"
          :default-model="verifiedModel"
        />
      </div>

      <footer class="provider-setup-footer">
        <button
          v-if="canGoBack"
          type="button"
          class="provider-setup-btn provider-setup-btn--ghost"
          @click="goBack"
        >
          {{ ps.wizard.back }}
        </button>
        <div class="provider-setup-footer-spacer" />
        <button
          v-if="!firstRun"
          type="button"
          class="provider-setup-btn provider-setup-btn--ghost"
          @click="skip"
        >
          {{ ps.wizard.skipForNow }}
        </button>
        <button
          v-if="showPrimaryAction"
          type="button"
          class="provider-setup-btn provider-setup-btn--primary"
          :disabled="primaryDisabled"
          @click="onPrimaryAction"
        >
          {{ primaryLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
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
import OnboardingAgentSetupStep from './OnboardingAgentSetupStep.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** Full-screen first-run flow — no skip, finishes on landing page. */
    firstRun?: boolean
  }>(),
  {
    firstRun: false,
  },
)

const emit = defineEmits<{
  close: []
  finished: []
}>()

const router = useRouter()
const { t } = useI18n()
const ps = computed(() => t.value.providerSetup)
const agentStore = useAgentStore()

type LlmStep = 'overview' | 'mode' | 'provider' | 'configure'
type WizardPhase = 'llm' | 'agents'

const phase = ref<WizardPhase>('llm')
const llmStep = ref<LlmStep>('mode')
const mode = ref<ProviderSetupCategory>('cloud')
const selectedProvider = ref<ProviderType | null>(null)
const setupVerified = ref(false)
const verifiedProvider = ref<ProviderType | null>(null)
const verifiedModel = ref('')
const agentsStepRef = ref<InstanceType<typeof OnboardingAgentSetupStep> | null>(
  null,
)

const configuredProviderIds = computed(() => agentStore.configuredLlmProviderIds)

const providerChoices = computed(() =>
  mode.value === 'local' ? LOCAL_LLM_PROVIDER_IDS : CLOUD_LLM_PROVIDER_IDS,
)

const canProceedFromLlm = computed(() => {
  if (phase.value !== 'llm') return false
  if (llmStep.value === 'overview') {
    return Boolean(verifiedProvider.value)
  }
  if (llmStep.value === 'configure') {
    return (
      setupVerified.value ||
      (selectedProvider.value !== null &&
        isProviderConfigured(selectedProvider.value))
    )
  }
  return false
})

const canGoBack = computed(() => {
  if (phase.value === 'agents') return true
  if (llmStep.value === 'overview') return false
  return llmStep.value !== 'mode'
})

const showPrimaryAction = computed(() => {
  if (phase.value === 'agents') return true
  return canProceedFromLlm.value
})

const primaryDisabled = computed(() => {
  if (phase.value === 'agents') {
    return !agentStore.areAllAgentsLlmReady
  }
  return false
})

const primaryLabel = computed(() => {
  if (phase.value === 'agents') {
    return props.firstRun ? ps.value.wizard.finishSetup : ps.value.wizard.continue
  }
  return ps.value.wizard.next
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void resetWizard()
    }
  },
)

function isProviderConfigured(id: ProviderType): boolean {
  return configuredProviderIds.value.includes(id)
}

function markProviderReady(id: ProviderType) {
  verifiedProvider.value = id
  const models = agentStore.availableModelsByProvider[id] ?? []
  verifiedModel.value = models[0] ?? ''
  setupVerified.value = true
}

async function resetWizard() {
  phase.value = 'llm'
  mode.value = 'cloud'
  selectedProvider.value = null
  setupVerified.value = false
  verifiedProvider.value = null
  verifiedModel.value = ''

  const configured = configuredProviderIds.value
  if (configured.length > 0) {
    llmStep.value = 'overview'
    const first = configured[0]!
    await agentStore.fetchModelsForProvider(first)
    markProviderReady(first)
    return
  }

  llmStep.value = 'mode'
}

function startAddProvider() {
  llmStep.value = 'mode'
  setupVerified.value = false
  verifiedProvider.value = null
  verifiedModel.value = ''
}

function selectConfiguredProvider(id: ProviderType) {
  selectedProvider.value = id
  void agentStore.fetchModelsForProvider(id)
  markProviderReady(id)
}

function providerLabel(id: ProviderType): string {
  return llmProviderSettingsLabel(id)
}

function pickMode(next: ProviderSetupCategory) {
  mode.value = next
  llmStep.value = 'provider'
}

function selectProvider(id: ProviderType) {
  selectedProvider.value = id
  llmStep.value = 'configure'
  if (isProviderConfigured(id)) {
    void agentStore.fetchModelsForProvider(id)
    markProviderReady(id)
  } else {
    setupVerified.value = false
    verifiedProvider.value = null
    verifiedModel.value = ''
  }
}

function goBack() {
  if (phase.value === 'agents') {
    phase.value = 'llm'
    if (configuredProviderIds.value.length > 0) {
      llmStep.value = 'overview'
    } else {
      llmStep.value = 'configure'
    }
    return
  }
  if (llmStep.value === 'configure') {
    if (configuredProviderIds.value.length > 0 && setupVerified.value) {
      llmStep.value = 'overview'
      return
    }
    llmStep.value = 'provider'
    setupVerified.value = false
    return
  }
  if (llmStep.value === 'provider') {
    if (configuredProviderIds.value.length > 0) {
      llmStep.value = 'overview'
      return
    }
    llmStep.value = 'mode'
  }
}

watch([selectedProvider, llmStep], () => {
  const id = selectedProvider.value
  if (llmStep.value !== 'configure' || !id) return
  if (isProviderConfigured(id) && !setupVerified.value) {
    void agentStore.fetchModelsForProvider(id).then(() => markProviderReady(id))
  }
})

function onTested(payload: { ok: boolean; provider?: ProviderType; model?: string }) {
  setupVerified.value = payload.ok
  if (payload.ok && selectedProvider.value) {
    verifiedProvider.value = selectedProvider.value
    const models =
      agentStore.availableModelsByProvider[selectedProvider.value] ?? []
    verifiedModel.value = payload.model?.trim() || models[0] || ''
  }
}

async function enterAgentsPhase() {
  if (verifiedProvider.value) {
    void agentStore.fetchModelsForProvider(verifiedProvider.value)
  }
  if (
    !agentStore.areAllAgentsLlmReady &&
    verifiedProvider.value &&
    verifiedModel.value.trim()
  ) {
    agentStore.applyLlmDefaultsToAllAgents(
      verifiedProvider.value,
      verifiedModel.value,
    )
  }
  phase.value = 'agents'
}

async function onPrimaryAction() {
  if (phase.value === 'llm') {
    await enterAgentsPhase()
    return
  }
  await finish()
}

async function skip() {
  await agentStore.dismissProviderSetupWizard()
  emit('close')
}

async function finish() {
  if (props.firstRun) {
    await agentStore.completeOnboarding()
    emit('finished')
    emit('close')
    void router.push('/landing')
    return
  }
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

.provider-setup-overlay--page {
  padding: 0;
  background: var(--ui-bg);
  backdrop-filter: none;
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

.provider-setup-modal--page {
  width: min(720px, 100%);
  max-height: min(96vh, 900px);
  margin: auto;
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

.provider-setup-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
}

.provider-setup-step {
  color: var(--ui-text-muted);
}

.provider-setup-step--active {
  color: var(--color-primary-600, var(--color-primary-500));
  font-weight: 650;
}

.provider-setup-step-sep {
  color: var(--ui-text-muted);
  opacity: 0.6;
}

.provider-setup-body {
  padding: 16px 22px;
  overflow-y: auto;
  overflow-x: visible;
  flex: 1;
  position: relative;
}

.provider-setup-body--configure {
  padding-top: 12px;
}

.provider-setup-agents-heading {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 650;
  color: var(--ui-text);
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.provider-setup-provider-chip--configured {
  border-color: color-mix(in srgb, var(--color-success-500, #22c55e) 55%, var(--ui-border));
  background: color-mix(in srgb, var(--color-success-500, #22c55e) 10%, var(--ui-bg));
  color: var(--color-success-700, #15803d);
}

.provider-setup-provider-chip--selected {
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent);
}

.provider-setup-provider-chip-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.provider-setup-provider-chip-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-success-500, #22c55e) 18%, transparent);
  color: var(--color-success-700, #15803d);
}

.provider-setup-link-btn {
  margin-top: 12px;
  padding: 0;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary-600, var(--color-primary-500));
  cursor: pointer;
  font-family: inherit;
}

.provider-setup-link-btn:hover {
  text-decoration: underline;
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
  background: color-mix(in srgb, var(--color-primary-500) 14%, var(--ui-bg));
  color: var(--color-primary-700, #1d4ed8);
  border: 1px solid var(--color-primary-500);
}

.provider-setup-btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary-500) 24%, var(--ui-bg));
}

:global(html.dark) .provider-setup-btn--primary {
  background: var(--color-primary-500);
  color: #fff;
  border-color: var(--color-primary-500);
}

:global(html.dark) .provider-setup-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
  background: var(--color-primary-500);
}

.provider-setup-btn--primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
