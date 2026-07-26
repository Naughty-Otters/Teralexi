<template>
  <div
    class="conversation-split"
    :class="
      node.type === 'group'
        ? node.orientation === 'horizontal'
          ? 'conversation-split--row'
          : 'conversation-split--column'
        : 'conversation-split--leaf'
    "
  >
    <template v-if="node.type === 'leaf'">
      <div
        class="conversation-split__leaf"
        :class="{ 'conversation-split__leaf--focused': isFocused }"
        @mousedown.capture="onFocusLeaf(node.paneId)"
      >
        <slot
          name="pane"
          :pane-id="node.paneId"
          :conversation-id="node.conversationId"
          :is-focused="isFocused"
        />
      </div>
    </template>

    <template v-else>
      <div
        class="conversation-split__child"
        :style="childStyle(0)"
      >
        <ConversationSplitLayout
          :node="node.children[0]"
          :focused-pane-id="focusedPaneId"
          :path="path.concat(0)"
          @focus-pane="onFocusLeaf"
          @update-ratio="onUpdateRatio"
        >
          <template #pane="slotProps">
            <slot name="pane" v-bind="slotProps" />
          </template>
        </ConversationSplitLayout>
      </div>

      <div
        class="conversation-split__handle"
        :class="
          node.orientation === 'horizontal'
            ? 'conversation-split__handle--vertical'
            : 'conversation-split__handle--horizontal'
        "
        role="separator"
        :aria-orientation="
          node.orientation === 'horizontal' ? 'vertical' : 'horizontal'
        "
        aria-label="Resize conversation panes"
        tabindex="0"
        @pointerdown="onHandlePointerDown"
        @keydown="onHandleKeydown"
      />

      <div
        class="conversation-split__child"
        :style="childStyle(1)"
      >
        <ConversationSplitLayout
          :node="node.children[1]"
          :focused-pane-id="focusedPaneId"
          :path="path.concat(1)"
          @focus-pane="onFocusLeaf"
          @update-ratio="onUpdateRatio"
        >
          <template #pane="slotProps">
            <slot name="pane" v-bind="slotProps" />
          </template>
        </ConversationSplitLayout>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PaneNode } from '@store/conversation-layout/types'

defineOptions({ name: 'ConversationSplitLayout' })

const props = withDefaults(
  defineProps<{
    node: PaneNode
    focusedPaneId: string | null
    path?: number[]
  }>(),
  {
    path: () => [],
  },
)

const emit = defineEmits<{
  'focus-pane': [paneId: string]
  'update-ratio': [path: number[], ratio: number]
}>()

const isFocused = computed(() => {
  if (props.node.type !== 'leaf') return false
  return props.node.paneId === props.focusedPaneId
})

function childStyle(index: 0 | 1): Record<string, string> {
  if (props.node.type !== 'group') return { flex: '1' }
  const ratio = props.node.ratio
  const size = index === 0 ? ratio : 1 - ratio
  if (props.node.orientation === 'horizontal') {
    return { flex: `0 0 ${size * 100}%`, width: `${size * 100}%`, minWidth: '0' }
  }
  return { flex: `0 0 ${size * 100}%`, height: `${size * 100}%`, minHeight: '0' }
}

function onFocusLeaf(paneId: string) {
  emit('focus-pane', paneId)
}

function onUpdateRatio(path: number[], ratio: number) {
  emit('update-ratio', path, ratio)
}

function onHandlePointerDown(event: PointerEvent) {
  if (props.node.type !== 'group') return
  const target = event.currentTarget as HTMLElement
  const parent = target.parentElement
  if (!parent) return
  event.preventDefault()
  const vertical = props.node.orientation === 'vertical'
  const rect = parent.getBoundingClientRect()
  const startPos = vertical ? event.clientY : event.clientX
  const startRatio = props.node.ratio
  const span = vertical ? rect.height : rect.width
  if (span <= 0) return

  const pointerId = event.pointerId
  target.setPointerCapture(pointerId)

  function onMove(ev: PointerEvent) {
    const pos = vertical ? ev.clientY : ev.clientX
    const delta = (pos - startPos) / span
    emit('update-ratio', props.path, startRatio + delta)
  }

  function onUp(ev: PointerEvent) {
    target.releasePointerCapture(pointerId)
    target.removeEventListener('pointermove', onMove)
    target.removeEventListener('pointerup', onUp)
    target.removeEventListener('pointercancel', onUp)
    void ev
  }

  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('pointercancel', onUp)
}

function onHandleKeydown(event: KeyboardEvent) {
  if (props.node.type !== 'group') return
  const step = event.shiftKey ? 0.08 : 0.02
  const vertical = props.node.orientation === 'vertical'
  let delta = 0
  if (vertical) {
    if (event.key === 'ArrowUp') delta = -step
    if (event.key === 'ArrowDown') delta = step
  } else {
    if (event.key === 'ArrowLeft') delta = -step
    if (event.key === 'ArrowRight') delta = step
  }
  if (!delta) return
  event.preventDefault()
  emit('update-ratio', props.path, props.node.ratio + delta)
}
</script>

<style scoped>
.conversation-split {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.conversation-split--row {
  flex-direction: row;
}
.conversation-split--column {
  flex-direction: column;
}
.conversation-split--leaf {
  flex-direction: column;
}
.conversation-split__leaf {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid transparent;
  border-radius: 6px;
  overflow: hidden;
}
.conversation-split__leaf--focused {
  border-color: color-mix(in srgb, var(--ui-text-muted) 18%, transparent);
}
.conversation-split__child {
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.conversation-split__handle {
  flex-shrink: 0;
  background: transparent;
  position: relative;
  z-index: 3;
  touch-action: none;
}
.conversation-split__handle--vertical {
  width: 6px;
  margin: 0 -3px;
  cursor: col-resize;
}
.conversation-split__handle--horizontal {
  height: 6px;
  margin: -3px 0;
  cursor: row-resize;
}
.conversation-split__handle--vertical::after,
.conversation-split__handle--horizontal::after {
  content: '';
  position: absolute;
  background: var(--ui-border);
}
.conversation-split__handle--vertical::after {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
}
.conversation-split__handle--horizontal::after {
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  transform: translateY(-50%);
}
.conversation-split__handle:hover::after,
.conversation-split__handle:focus-visible::after {
  background: color-mix(in srgb, var(--color-primary-500) 55%, var(--ui-border));
}
</style>
