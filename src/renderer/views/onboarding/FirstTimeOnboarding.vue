<template>
  <div class="first-time-onboarding">
    <SignInRequiredPanel
      v-if="ready && !isSignedIn && !continuingLocal"
      :description="t.signInGate.wizard"
      :hint="t.auth.localLlmHint"
      :secondary-action-label="t.auth.openLocalLlmSettings"
      @signed-in="onSignedIn"
      @secondary-action="continueWithLocal"
    />
    <ProviderSetupWizard
      v-else-if="ready"
      :open="showWizard"
      :local-only="!isSignedIn"
      first-run
      @finished="onFinished"
    />
    <div v-else class="first-time-onboarding-loading">
      {{ t.common.loading }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import { useAgentStore } from '@store/agent'
import { markOnboardingCompleteInRouteCache } from '@renderer/lib/onboarding-route-state'
import ProviderSetupWizard from '../agent-chat/components/ProviderSetupWizard.vue'
import SignInRequiredPanel from '../agent-chat/components/SignInRequiredPanel.vue'

const router = useRouter()
const { t } = useI18n()
const { isSignedIn, refresh } = useGoogleAccount()
const agentStore = useAgentStore()

const ready = ref(false)
const showWizard = ref(true)
const continuingLocal = ref(false)

/**
 * First-run path: auth (unless local escape) → LLM/agents wizard → /landing summary.
 * Only auto-skip when already signed in and fully configured.
 */
async function maybeSkipIfAlreadyConfigured(): Promise<boolean> {
  if (!isSignedIn.value) return false
  if (!agentStore.hasLlmProviderReady || !agentStore.areAllAgentsLlmReady) {
    return false
  }
  await agentStore.completeOnboarding()
  markOnboardingCompleteInRouteCache()
  void router.replace('/')
  return true
}

onMounted(async () => {
  await Promise.all([agentStore.initializeSettingsFromConfig(), refresh()])
  if (await maybeSkipIfAlreadyConfigured()) return
  ready.value = true
})

watch(isSignedIn, async (signedIn) => {
  if (!signedIn || !ready.value) return
  continuingLocal.value = false
  if (await maybeSkipIfAlreadyConfigured()) return
  showWizard.value = true
})

function onSignedIn() {
  continuingLocal.value = false
  showWizard.value = true
}

function continueWithLocal() {
  continuingLocal.value = true
  showWizard.value = true
}

function onFinished() {
  showWizard.value = false
  markOnboardingCompleteInRouteCache()
}
</script>

<style scoped>
.first-time-onboarding {
  width: 100%;
  height: 100%;
  min-height: calc(100vh - var(--app-title-bar-height, 30px));
  background: var(--ui-bg);
}

.first-time-onboarding-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 14px;
  color: var(--ui-text-muted);
}
</style>
