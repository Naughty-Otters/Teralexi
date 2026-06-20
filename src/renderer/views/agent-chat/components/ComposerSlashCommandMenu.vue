<template>
  <div
    v-if="open && items.length > 0"
    ref="menuRef"
    class="slash-command-menu"
    role="listbox"
    aria-label="Slash commands"
    tabindex="-1"
    @keydown="onMenuKeydown"
  >
    <button
      v-for="(cmd, index) in items"
      :key="cmd.name"
      :ref="(el) => setItemRef(el, index)"
      type="button"
      class="slash-command-menu__item"
      :class="{ 'slash-command-menu__item--active': index === activeIndex }"
      role="option"
      :aria-selected="index === activeIndex"
      @mousedown.prevent
      @mouseenter="emit('highlight', index)"
      @mousemove="emit('highlight', index)"
      @click.stop="emit('select', cmd)"
      @keydown="onItemKeydown($event, index)"
    >
      <UIcon :name="cmd.icon" class="slash-command-menu__icon" aria-hidden="true" />
      <span class="slash-command-menu__body">
        <span class="slash-command-menu__label">{{ cmd.label }}</span>
        <span class="slash-command-menu__desc">{{ cmd.description }}</span>
      </span>
    </button>
  </div>
  <p
    v-else-if="open && query.length > 0"
    class="slash-command-menu slash-command-menu--hint"
  >
    No matching commands
  </p>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ComposerSlashCommand } from './composer-slash-commands'

const props = defineProps<{
  open: boolean
  query: string
  items: ComposerSlashCommand[]
  activeIndex: number
}>()

const emit = defineEmits<{
  select: [command: ComposerSlashCommand]
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

defineExpose({ focusActiveItem })
</script>

<style scoped>
.slash-command-menu {
  position: absolute;
  left: 10px;
  right: 52px;
  bottom: calc(100% + 4px);
  z-index: 20;
  max-height: 220px;
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

.slash-command-menu--hint {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.slash-command-menu__item {
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

.slash-command-menu__item:hover:not(.slash-command-menu__item--active) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.slash-command-menu__item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary-500, #6366f1) 55%, transparent);
  outline-offset: -2px;
}

.slash-command-menu__item.slash-command-menu__item--active,
.slash-command-menu__item.slash-command-menu__item--active:hover {
  background-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 16%,
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--color-primary-500, #6366f1) 40%, var(--ui-border, #e5e7eb));
}

.slash-command-menu__item--active .slash-command-menu__label {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-weight: 700;
}

.slash-command-menu__item--active .slash-command-menu__icon {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
}

.slash-command-menu__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--color-primary-500, #6366f1);
}

.slash-command-menu__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.slash-command-menu__label {
  font-family: var(--app-font-family);
  font-size: 12px;
  font-weight: 600;
}

.slash-command-menu__desc {
  font-size: 11px;
  line-height: 1.35;
  color: var(--ui-text-muted);
}
</style>
