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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@renderer/composables/useI18n'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import { useAgentStore } from '@store/agent'
import { markOnboardingCompleteInRouteCache } from '@renderer/lib/onboarding-route-state'
import ProviderSetupWizard from '../agent-chat/components/ProviderSetupWizard.vue'
import SignInRequiredPanel from '../agent-chat/components/SignInRequiredPanel.vue'

const router = useRouter()
const { t } = useI18n()
const { isSignedIn } = useGoogleAccount()
const agentStore = useAgentStore()

const ready = ref(false)
const showWizard = ref(true)
const continuingLocal = ref(false)

onMounted(async () => {
  await agentStore.initializeSettingsFromConfig()
  ready.value = true

  // Cloud API keys are known from config; local providers are probed in the setup wizard.
  if (agentStore.hasLlmProviderReady && agentStore.areAllAgentsLlmReady) {
    await agentStore.completeOnboarding()
    markOnboardingCompleteInRouteCache()
    void router.replace('/')
    return
  }
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
