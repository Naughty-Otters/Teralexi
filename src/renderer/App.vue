<template>
  <UApp>
    <title-bar />
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
}
</style>

<style src="./views/agent-chat/components/chat/chatPanelButton.css"></style>
