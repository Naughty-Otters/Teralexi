<template>
  <UTooltip
    :text="text"
    :delay-duration="delayDuration"
    :disabled="disabled || !text"
    :ui="tooltipUi"
  >
    <!-- Disabled buttons don't emit pointer events; wrap so tooltips still show. -->
    <span class="app-icon-tooltip" :class="{ 'app-icon-tooltip--block': block }">
      <slot />
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    text: string
    /** ms before tooltip appears */
    delayDuration?: number
    disabled?: boolean
    /** Stretch wrapper to fill flex parents when needed */
    block?: boolean
  }>(),
  {
    delayDuration: 250,
    disabled: false,
    block: false,
  },
)

/** Solid surface classes — see unscoped styles below (portaled outside component). */
const tooltipUi = {
  content: 'app-icon-tooltip__surface',
  text: 'app-icon-tooltip__text',
}
</script>

<style scoped>
.app-icon-tooltip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
}
.app-icon-tooltip--block {
  display: flex;
  width: 100%;
}
.app-icon-tooltip :deep(button:disabled),
.app-icon-tooltip :deep(.cp-icon-btn:disabled),
.app-icon-tooltip :deep(.rich-composer-tool:disabled) {
  pointer-events: none;
}
</style>

<!-- Unscoped: UTooltip content is teleported to <body>. -->
<style>
.app-icon-tooltip__surface {
  /* Override Nuxt UI tooltip `h-6` / single-line defaults for readable copy. */
  display: block !important;
  height: auto !important;
  max-width: min(280px, calc(100vw - 24px)) !important;
  padding: 8px 10px !important;
  background-color: #0f172a !important;
  color: #f8fafc !important;
  opacity: 1 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.35) !important;
  border: none !important;
  white-space: normal !important;
  line-height: 1.35 !important;
}
.app-icon-tooltip__text {
  display: block !important;
  color: #f8fafc !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  word-break: break-word;
  margin: 0 !important;
}
html.dark .app-icon-tooltip__surface {
  background-color: #f1f5f9 !important;
  color: #0f172a !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45) !important;
}
html.dark .app-icon-tooltip__text {
  color: #0f172a !important;
}
</style>
