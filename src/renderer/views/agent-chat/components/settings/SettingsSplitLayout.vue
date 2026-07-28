<template>
  <div
    ref="layoutEl"
    class="ssl-layout"
    :class="[{ 'ssl-layout--resizing': isResizing }, layoutClass]"
  >
    <aside
      class="ssl-sidebar"
      :class="sidebarClass"
      :style="{ width: `${sizePx}px` }"
    >
      <slot name="sidebar" />
    </aside>

    <PanelResizeHandle
      placement="after-start"
      :active="isResizing"
      :aria-label="ariaLabel"
      @pointerdown="onResizePointerDown"
      @keyboard-resize="onKeyboardResize"
    />

    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PanelResizeHandle from '@renderer/components/PanelResizeHandle.vue'
import { useHorizontalPanelResize } from '@renderer/composables/useHorizontalPanelResize'

const props = withDefaults(
  defineProps<{
    /** Persisted sidebar width key (localStorage). */
    storageKey: string
    defaultWidth?: number
    minWidth?: number
    /** Leave room for the detail pane. */
    reserveContentPx?: number
    maxFraction?: number
    layoutClass?: string | Record<string, boolean> | Array<string | Record<string, boolean>>
    sidebarClass?: string | Record<string, boolean> | Array<string | Record<string, boolean>>
    ariaLabel?: string
  }>(),
  {
    defaultWidth: 200,
    minWidth: 140,
    reserveContentPx: 280,
    maxFraction: 0.55,
    ariaLabel: 'Resize settings list',
  },
)

const layoutEl = ref<HTMLElement | null>(null)

const {
  sizePx,
  isResizing,
  onResizePointerDown,
  setSize,
} = useHorizontalPanelResize({
  containerRef: layoutEl,
  panelSide: 'start',
  defaultSize: props.defaultWidth,
  minSize: props.minWidth,
  maxSize: {
    fraction: props.maxFraction,
    reservePx: props.reserveContentPx,
  },
  storageKey: props.storageKey,
})

function onKeyboardResize(delta: number) {
  setSize(sizePx.value + delta)
}
</script>

<style scoped>
.ssl-layout {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
  min-height: 0;
  flex: 1;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
}

.ssl-layout--resizing {
  cursor: col-resize;
  user-select: none;
}

.ssl-sidebar {
  flex-shrink: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px;
  overflow-x: hidden;
  overflow-y: auto;
}
</style>
