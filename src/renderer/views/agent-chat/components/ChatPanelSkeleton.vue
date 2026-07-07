<template>
  <div class="chat-panel-skeleton" role="status" aria-live="polite">
    <div class="chat-panel-skeleton__header">
      <span class="chat-panel-skeleton__header-line chat-panel-skeleton__header-line--title" />
      <span class="chat-panel-skeleton__header-line chat-panel-skeleton__header-line--meta" />
    </div>

    <div class="chat-panel-skeleton__body">
      <ChatConversationSkeleton aria-label="Loading chat" />
    </div>

    <div class="chat-panel-skeleton__composer">
      <ComposerSkeleton />
    </div>
  </div>
</template>

<script setup lang="ts">
import ChatConversationSkeleton from './ChatConversationSkeleton.vue'
import ComposerSkeleton from './ComposerSkeleton.vue'
</script>

<style scoped>
.chat-panel-skeleton {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-bg);
}

.chat-panel-skeleton__header {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: var(--agent-header-min-height, 64px);
  padding: var(--agent-header-padding-y, 10px)
    var(--agent-header-padding-x, 20px);
  border-bottom: 1px solid var(--ui-border);
  box-sizing: border-box;
}

.chat-panel-skeleton__header-line {
  display: block;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 0%,
    color-mix(in srgb, var(--ui-text) 10%, var(--ui-bg-accented)) 50%,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 100%
  );
  background-size: 200% 100%;
  animation: chat-panel-skeleton-shimmer 1.2s ease-in-out infinite;
}

.chat-panel-skeleton__header-line--title {
  width: 180px;
  height: 14px;
}

.chat-panel-skeleton__header-line--meta {
  width: 120px;
}

.chat-panel-skeleton__body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.chat-panel-skeleton__composer {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--ui-border);
}

.chat-panel-skeleton__composer :deep(.composer-skeleton) {
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-bg-elevated);
}

@keyframes chat-panel-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
