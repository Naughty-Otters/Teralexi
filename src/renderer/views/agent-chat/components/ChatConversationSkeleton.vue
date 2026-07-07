<template>
  <div
    class="chat-conversation-skeleton"
    role="status"
    :aria-label="ariaLabel"
    aria-live="polite"
  >
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="chat-conversation-skeleton__row"
      :class="`chat-conversation-skeleton__row--${row.align}`"
    >
      <div
        class="chat-conversation-skeleton__bubble"
        :class="`chat-conversation-skeleton__bubble--${row.align}`"
      >
        <span
          v-for="(width, lineIndex) in row.lines"
          :key="lineIndex"
          class="chat-conversation-skeleton__line"
          :style="{ width }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    ariaLabel?: string
  }>(),
  { ariaLabel: 'Loading conversation' },
)

const rows = [
  { align: 'assistant' as const, lines: ['68%', '54%', '42%'] },
  { align: 'user' as const, lines: ['52%', '36%'] },
  { align: 'assistant' as const, lines: ['74%', '48%'] },
]
</script>

<style scoped>
.chat-conversation-skeleton {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--ui-bg);
  box-sizing: border-box;
  overflow: hidden;
}

.chat-conversation-skeleton__row {
  display: flex;
  max-width: 92%;
  min-width: min(50%, 320px);
}

.chat-conversation-skeleton__row--assistant {
  align-self: flex-start;
}

.chat-conversation-skeleton__row--user {
  align-self: flex-end;
}

.chat-conversation-skeleton__bubble {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  box-sizing: border-box;
}

.chat-conversation-skeleton__bubble--user {
  min-width: 220px;
}

.chat-conversation-skeleton__bubble--assistant {
  min-width: 280px;
}

.chat-conversation-skeleton__line {
  display: block;
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 0%,
    color-mix(in srgb, var(--ui-text) 10%, var(--ui-bg-accented)) 50%,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 100%
  );
  background-size: 200% 100%;
  animation: chat-conversation-skeleton-shimmer 1.2s ease-in-out infinite;
}

@keyframes chat-conversation-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
