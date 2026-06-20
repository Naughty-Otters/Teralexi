<template>
  <div
    v-if="open && items.length > 0"
    ref="menuRef"
    class="sub-agent-mention-menu"
    role="listbox"
    aria-label="Sub-agent mentions"
    tabindex="-1"
    @keydown="onMenuKeydown"
  >
    <button
      v-for="(item, index) in items"
      :key="item.id"
      :ref="(el) => setItemRef(el, index)"
      type="button"
      class="sub-agent-mention-menu__item"
      :class="{ 'sub-agent-mention-menu__item--active': index === activeIndex }"
      role="option"
      :aria-selected="index === activeIndex"
      @mousedown.prevent
      @mouseenter="emit('highlight', index)"
      @mousemove="emit('highlight', index)"
      @click.stop="emit('select', item)"
      @keydown="onItemKeydown($event, index)"
    >
      <UIcon
        name="i-lucide-bot"
        class="sub-agent-mention-menu__icon"
        aria-hidden="true"
      />
      <span class="sub-agent-mention-menu__body">
        <span class="sub-agent-mention-menu__title">
          @{{ item.mentionSlug }}
          <span class="sub-agent-mention-menu__name">{{ item.name }}</span>
        </span>
        <span v-if="item.description" class="sub-agent-mention-menu__desc">
          {{ item.description }}
        </span>
      </span>
    </button>
    <p class="sub-agent-mention-menu__footer">
      @agent-name delegates to an enabled sub-agent
    </p>
  </div>
  <p
    v-else-if="open && enabled && items.length === 0 && query.length >= 0"
    class="sub-agent-mention-menu sub-agent-mention-menu--hint"
  >
    No matching sub-agents
  </p>
  <p
    v-else-if="open && !enabled"
    class="sub-agent-mention-menu sub-agent-mention-menu--hint"
  >
    Enable sub-agents in agent settings to use @ mentions
  </p>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { SubAgentTarget } from '@shared/agent/sub-agent-targets'

const props = defineProps<{
  open: boolean
  query: string
  items: SubAgentTarget[]
  activeIndex: number
  enabled: boolean
}>()

const emit = defineEmits<{
  select: [item: SubAgentTarget]
  highlight: [index: number]
  close: []
}>()

const menuRef = ref<HTMLDivElement | null>(null)
const itemRefs = ref<(HTMLButtonElement | null)[]>([])

function setItemRef(el: unknown, index: number) {
  if (el instanceof HTMLButtonElement) {
    itemRefs.value[index] = el
  }
}

function focusItem(index: number) {
  void nextTick(() => {
    const item = itemRefs.value[index]
    item?.focus()
    item?.scrollIntoView({ block: 'nearest' })
  })
}

function moveHighlight(fromIndex: number, delta: number) {
  const len = props.items.length
  if (len === 0) return
  const next = (fromIndex + delta + len) % len
  emit('highlight', next)
  focusItem(next)
}

function onItemKeydown(event: KeyboardEvent, index: number) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(index, 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(index, -1)
      break
    case 'Tab':
      event.preventDefault()
      moveHighlight(index, event.shiftKey ? -1 : 1)
      break
    case 'Enter':
      event.preventDefault()
      emit('select', props.items[index]!)
      break
    case 'Escape':
      event.preventDefault()
      emit('close')
      break
  }
}

function onMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

function focusActiveItem() {
  focusItem(Math.min(props.activeIndex, Math.max(0, props.items.length - 1)))
}

watch(
  () => props.items.length,
  () => {
    itemRefs.value = []
  },
)

defineExpose({ focusActiveItem, moveHighlight })
</script>

<style scoped>
.sub-agent-mention-menu {
  position: absolute;
  left: 10px;
  right: 52px;
  bottom: calc(100% + 4px);
  z-index: 21;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-bg-elevated, var(--ui-bg, #ffffff));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ui-border) 80%, transparent),
    0 10px 28px color-mix(in srgb, var(--ui-text) 18%, transparent);
  padding: 4px;
  isolation: isolate;
}

.sub-agent-mention-menu--hint {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.sub-agent-mention-menu__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text);
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
  font: inherit;
}

.sub-agent-mention-menu__item:hover:not(.sub-agent-mention-menu__item--active) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.sub-agent-mention-menu__item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary-500, #6366f1) 55%, transparent);
  outline-offset: -2px;
}

.sub-agent-mention-menu__item.sub-agent-mention-menu__item--active,
.sub-agent-mention-menu__item.sub-agent-mention-menu__item--active:hover {
  background-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 16%,
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--color-primary-500, #6366f1) 40%, var(--ui-border, #e5e7eb));
}

.sub-agent-mention-menu__item--active .sub-agent-mention-menu__title {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-weight: 700;
}

.sub-agent-mention-menu__item--active .sub-agent-mention-menu__icon {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
}

.sub-agent-mention-menu__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--color-primary-500, #6366f1);
}

.sub-agent-mention-menu__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sub-agent-mention-menu__title {
  font-family: var(--app-font-family);
  font-size: 12px;
  font-weight: 600;
}

.sub-agent-mention-menu__name {
  font-family: inherit;
  font-weight: 400;
  color: var(--ui-text-muted);
  margin-left: 6px;
}

.sub-agent-mention-menu__desc {
  font-size: 11px;
  line-height: 1.35;
  color: var(--ui-text-muted);
}

.sub-agent-mention-menu__footer {
  margin: 4px 0 0;
  padding: 6px 8px 2px;
  font-size: 11px;
  color: var(--ui-text-muted);
  border-top: 1px solid var(--ui-border);
}
</style>
