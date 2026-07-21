<template>
  <div class="first-time-onboarding">
    <SignInRequiredPanel
      v-if="ready && !isSignedIn && !leavingWithoutLogin"
      :title="t.auth.signInOptionalTitle"
      :description="t.auth.signInOptionalDesc"
      :hint="t.auth.continueWithoutAccountHint"
      :secondary-action-label="t.auth.continueWithoutAccount"
      @signed-in="onSignedIn"
      @secondary-action="continueWithoutLogin"
    />
    <ProviderSetupWizard
      v-else-if="ready && showProviderSetup"
      :open="showProviderSetup"
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
const showProviderSetup = ref(false)
const leavingWithoutLogin = ref(false)

/**
 * First-run path: optional sign-in → provider setup (after sign-in) → /landing.
 * Continue without login skips provider setup and enters the app.
 * Auto-skip only when already signed in and fully configured.
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
  if (isSignedIn.value) {
    showProviderSetup.value = true
  }
  ready.value = true
})

watch(isSignedIn, async (signedIn) => {
  if (!signedIn || !ready.value || leavingWithoutLogin.value) return
  if (await maybeSkipIfAlreadyConfigured()) return
  showProviderSetup.value = true
})

function onSignedIn() {
  leavingWithoutLogin.value = false
  showProviderSetup.value = true
}

async function continueWithoutLogin() {
  leavingWithoutLogin.value = true
  showProviderSetup.value = false
  await agentStore.completeOnboarding()
  markOnboardingCompleteInRouteCache()
  void router.replace('/landing')
}

function onFinished() {
  showProviderSetup.value = false
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
