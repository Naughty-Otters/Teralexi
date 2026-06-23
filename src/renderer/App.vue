<template>
  <UApp>
    <Teleport to="body">
      <TitleBar />
    </Teleport>
    <div class="main">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </div>
  </UApp>
</template>

<script setup lang="ts">
import TitleBar from '@renderer/components/title-bar/title-bar.vue'
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
</style>

<style src="./views/agent-chat/components/chat/chatPanelButton.css"></style>
