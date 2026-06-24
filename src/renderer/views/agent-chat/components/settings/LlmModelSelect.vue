<template>
  <div ref="rootEl" class="llm-model-select" :class="{ 'llm-model-select--open': menuOpen }">
    <button
      ref="triggerRef"
      type="button"
      class="llm-model-select__trigger"
      :class="{ 'llm-model-select__trigger--open': menuOpen }"
      :disabled="disabled"
      :aria-expanded="menuOpen"
      aria-haspopup="listbox"
      @mousedown.prevent
      @click="toggleMenu"
    >
      <span
        class="llm-model-select__value"
        :class="{ 'llm-model-select__value--placeholder': !modelValue.trim() }"
      >
        {{ selectedLabel }}
      </span>
      <UIcon
        class="llm-model-select__chevron"
        name="i-lucide-chevron-down"
        aria-hidden="true"
      />
    </button>
    <div
      v-if="menuOpen"
      ref="menuRef"
      class="llm-model-select__menu"
      role="listbox"
      aria-label="Select model"
      tabindex="-1"
    >
      <button
        v-for="(option, index) in options"
        :key="option.id"
        :ref="(el) => setItemRef(el, index)"
        type="button"
        class="llm-model-select__option"
        :class="{
          'llm-model-select__option--active': index === highlightIndex,
        }"
        role="option"
        :aria-selected="option.id === modelValue"
        @mousedown.prevent
        @mouseenter="highlightIndex = index"
        @click="selectModel(option.id)"
        @keydown="onItemKeydown($event, index)"
      >
        <span class="llm-model-select__option-label">{{ option.label }}</span>
        <UIcon
          v-if="option.id === modelValue"
          class="llm-model-select__option-check"
          name="i-lucide-check"
          aria-hidden="true"
        />
      </button>
      <p v-if="options.length === 0" class="llm-model-select__empty">
        No models loaded for this provider
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    models: readonly string[]
    disabled?: boolean
    placeholder?: string
  }>(),
  {
    disabled: false,
    placeholder: 'Select a model…',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

type ModelOption = { id: string; label: string; unknown?: boolean }

const options = computed((): ModelOption[] => {
  const models = props.models.map((id) => ({ id, label: id }))
  const current = props.modelValue.trim()
  if (current && !props.models.includes(current)) {
    return [
      { id: current, label: `${current} (not in list)`, unknown: true },
      ...models,
    ]
  }
  return models
})

const rootEl = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)
const menuOpen = ref(false)
const highlightIndex = ref(0)
const itemRefs = ref<(HTMLButtonElement | null)[]>([])

const selectedLabel = computed(() => {
  const current = props.modelValue.trim()
  if (!current) return props.placeholder
  const known = options.value.find((option) => option.id === current)
  return known?.label ?? current
})

function setItemRef(el: unknown, index: number) {
  if (el instanceof HTMLButtonElement) {
    itemRefs.value[index] = el
  }
}

function initialHighlightIndex(): number {
  const idx = options.value.findIndex((option) => option.id === props.modelValue)
  return idx >= 0 ? idx : 0
}

function scrollToHighlight() {
  void nextTick(() => {
    const item = itemRefs.value[highlightIndex.value]
    item?.scrollIntoView({ block: 'nearest' })
  })
}

function moveHighlight(delta: number) {
  const len = options.value.length
  if (len === 0) return
  highlightIndex.value = (highlightIndex.value + delta + len) % len
  scrollToHighlight()
}

function selectModel(model: string) {
  if (!model) return
  emit('update:modelValue', model)
  closeMenu()
}

function onItemKeydown(event: KeyboardEvent, index: number) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(-1)
      break
    case 'Tab':
      event.preventDefault()
      moveHighlight(event.shiftKey ? -1 : 1)
      break
    case 'Enter':
      event.preventDefault()
      selectModel(options.value[index]?.id ?? props.modelValue)
      break
    case 'Escape':
      event.preventDefault()
      closeMenu()
      break
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (!menuOpen.value) return
  const target = event.target
  if (target instanceof Node && rootEl.value?.contains(target)) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      event.stopPropagation()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      event.stopPropagation()
      moveHighlight(-1)
      break
    case 'Enter':
      event.preventDefault()
      event.stopPropagation()
      selectModel(options.value[highlightIndex.value]?.id ?? props.modelValue)
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      break
    case 'Tab':
      event.preventDefault()
      event.stopPropagation()
      moveHighlight(event.shiftKey ? -1 : 1)
      break
  }
}

function toggleMenu() {
  if (props.disabled || options.value.length === 0) return
  if (menuOpen.value) {
    closeMenu()
    return
  }
  openMenu()
}

function openMenu() {
  menuOpen.value = true
  highlightIndex.value = initialHighlightIndex()
  itemRefs.value = []
  scrollToHighlight()
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  triggerRef.value?.focus()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return
  const root = rootEl.value
  if (root && !root.contains(event.target as Node)) {
    closeMenu()
  }
}

watch(
  () => props.modelValue,
  () => {
    if (menuOpen.value) {
      highlightIndex.value = initialHighlightIndex()
    }
  },
)

watch(
  () => props.models,
  () => {
    itemRefs.value = []
    if (menuOpen.value && highlightIndex.value >= options.value.length) {
      highlightIndex.value = Math.max(0, options.value.length - 1)
    }
  },
)

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown, true)
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<style scoped>
.llm-model-select {
  position: relative;
  width: 100%;
  min-width: 0;
}

.llm-model-select--open {
  z-index: 120;
}

.llm-model-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--ui-text);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.llm-model-select__trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.llm-model-select__trigger--open {
  border-color: var(--color-primary-500);
}

.llm-model-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--app-font-family);
  font-size: 12px;
}

.llm-model-select__value--placeholder {
  color: var(--ui-text-muted);
  font-family: inherit;
  font-size: 13px;
}

.llm-model-select__chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
  transition: transform 0.15s;
}

.llm-model-select__trigger--open .llm-model-select__chevron {
  transform: rotate(180deg);
}

.llm-model-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 130;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg, #ffffff));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ui-border) 80%, transparent),
    0 10px 28px color-mix(in srgb, var(--ui-text) 18%, transparent);
}

.llm-model-select__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-family: var(--app-font-family);
  text-align: left;
  cursor: pointer;
}

.llm-model-select__option:hover:not(.llm-model-select__option--active) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.llm-model-select__option:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary-500, #6366f1) 55%, transparent);
  outline-offset: -2px;
}

.llm-model-select__option--active,
.llm-model-select__option--active:hover {
  background-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 16%,
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--color-primary-500, #6366f1) 40%, var(--ui-border, #e5e7eb));
}

.llm-model-select__option--active .llm-model-select__option-label {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-weight: 700;
}

.llm-model-select__option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.llm-model-select__option-check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary-500, #6366f1);
}

.llm-model-select__empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
</style>
