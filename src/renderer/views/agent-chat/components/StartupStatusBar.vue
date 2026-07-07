<template>
  <div
    v-if="message"
    class="startup-status-bar"
    role="status"
    aria-live="polite"
  >
    <UIcon
      name="i-lucide-loader-circle"
      class="startup-status-bar__icon"
      aria-hidden="true"
    />
    <span class="startup-status-bar__text">{{ message }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string | null
}>()
</script>

<style scoped>
.startup-status-bar {
  position: absolute;
  left: 50%;
  bottom: 14px;
  z-index: 5;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(92%, 520px);
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-bg-elevated) 92%, transparent);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ui-bg) 35%, transparent);
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
  pointer-events: none;
}
.startup-status-bar__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  animation: startup-status-spin 0.9s linear infinite;
}
.startup-status-bar__text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@keyframes startup-status-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
