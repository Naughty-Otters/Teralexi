<template>
  <UApp>
    <Teleport to="body">
      <TitleBar />
    </Teleport>
    <div class="main" :class="{ 'main--authorization-blocked': authorizationBlocked }">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </div>
    <AuthorizationBlockedOverlay
      :open="authorizationBlocked"
      :error-message="authorizationErrorMessage"
    />
  </UApp>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import { useEntitlement } from '@renderer/composables/useEntitlement'

const TitleBar = defineAsyncComponent(
  () => import('@renderer/components/title-bar/title-bar.vue'),
)
const AuthorizationBlockedOverlay = defineAsyncComponent(
  () => import('@renderer/components/AuthorizationBlockedOverlay.vue'),
)
import {
  bindAppUpdateListeners,
  loadAppVersion,
} from '@renderer/composables/useAppUpdate'

const { isSignedIn } = useGoogleAccount()
const { isAuthorizationBlocked, authorizationErrorMessage } = useEntitlement()

const authorizationBlocked = computed(
  () => isSignedIn.value && isAuthorizationBlocked.value,
)

let unbindAppUpdate: (() => void) | null = null

onMounted(() => {
  unbindAppUpdate = bindAppUpdateListeners()
  void loadAppVersion()
})

onUnmounted(() => {
  unbindAppUpdate?.()
})
</script>

<style scoped>
.main {
  width: 100%;
  height: 100vh;
  padding-top: var(--app-title-bar-height, 30px);
  box-sizing: border-box;
  position: relative;
  z-index: 0;
}

.main--authorization-blocked {
  pointer-events: none;
  user-select: none;
}
</style>

<style src="./views/agent-chat/components/chat/chatPanelButton.css"></style>
