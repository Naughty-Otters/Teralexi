<template>
  <div class="first-time-onboarding">
    <ProviderSetupWizard
      v-if="ready"
      :open="showWizard"
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
import { useAgentStore } from '@store/agent'
import { markOnboardingCompleteInRouteCache } from '@renderer/lib/onboarding-route-state'
import ProviderSetupWizard from '../agent-chat/components/ProviderSetupWizard.vue'

const router = useRouter()
const { t } = useI18n()
const agentStore = useAgentStore()

const ready = ref(false)
const showWizard = ref(true)

onMounted(async () => {
  await agentStore.initializeSettingsFromConfig()
  await agentStore.loadSkillsFromDisk()
  await agentStore.checkConnection()
  await agentStore.checkLlamaCppConnection()
  await agentStore.fetchModelsForProvider('ollama')

  ready.value = true

  if (agentStore.hasLlmProviderReady && agentStore.areAllAgentsLlmReady) {
    await agentStore.completeOnboarding()
    markOnboardingCompleteInRouteCache()
    void router.replace('/')
    return
  }
})

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
