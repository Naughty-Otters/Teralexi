<template>
  <UTooltip
    :text="hasContentSlot ? undefined : text"
    :delay-duration="delayDuration"
    :disabled="disabled || (!hasContentSlot && !text)"
    :content="resolvedContent"
    :ui="tooltipUi"
  >
    <!-- Disabled buttons don't emit pointer events; wrap so tooltips still show. -->
    <span class="app-icon-tooltip" :class="{ 'app-icon-tooltip--block': block }">
      <slot />
    </span>
    <template v-if="hasContentSlot" #content>
      <slot name="content" />
    </template>
  </UTooltip>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = withDefaults(
  defineProps<{
    text?: string
    /** ms before tooltip appears */
    delayDuration?: number
    disabled?: boolean
    /** Stretch wrapper to fill flex parents when needed */
    block?: boolean
    /**
     * Positioning relative to the trigger.
     * Defaults match Nuxt UI (`side: 'bottom'`, `sideOffset: 8`).
     */
    content?: {
      side?: 'top' | 'right' | 'bottom' | 'left'
      align?: 'start' | 'center' | 'end'
      sideOffset?: number
      alignOffset?: number
      collisionPadding?: number
    }
  }>(),
  {
    text: '',
    delayDuration: 250,
    disabled: false,
    block: false,
    content: undefined,
  },
)

const slots = useSlots()
const hasContentSlot = computed(() => Boolean(slots.content))
const resolvedContent = computed(() => props.content)

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
  max-width: min(320px, calc(100vw - 24px)) !important;
  padding: 10px 12px !important;
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
.app-icon-tooltip__detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
  max-width: min(300px, calc(100vw - 40px));
}
.app-icon-tooltip__detail-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: inherit;
  word-break: break-word;
}
.app-icon-tooltip__detail-rows {
  margin: 0;
  display: grid;
  gap: 5px;
}
.app-icon-tooltip__detail-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin: 0;
}
.app-icon-tooltip__detail-label {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  opacity: 0.72;
}
.app-icon-tooltip__detail-value {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  word-break: break-word;
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
