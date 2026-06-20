<template>
  <div ref="rootEl" class="llm-provider-select">
    <button
      ref="triggerRef"
      type="button"
      class="llm-provider-select__trigger"
      :class="{ 'llm-provider-select__trigger--open': menuOpen }"
      :disabled="disabled"
      :aria-expanded="menuOpen"
      aria-haspopup="listbox"
      @mousedown.prevent
      @click="toggleMenu"
    >
      <span class="llm-provider-select__value">{{ selectedLabel }}</span>
      <UIcon
        class="llm-provider-select__chevron"
        name="i-lucide-chevron-down"
        aria-hidden="true"
      />
    </button>
    <div
      v-if="menuOpen"
      ref="menuRef"
      class="llm-provider-select__menu"
      role="listbox"
      aria-label="Select provider"
      tabindex="-1"
    >
      <button
        v-for="(option, index) in options"
        :key="option.id"
        :ref="(el) => setItemRef(el, index)"
        type="button"
        class="llm-provider-select__option"
        :class="{
          'llm-provider-select__option--active': index === highlightIndex,
        }"
        role="option"
        :aria-selected="option.id === modelValue"
        @mousedown.prevent
        @mouseenter="highlightIndex = index"
        @click="selectProvider(option.id)"
        @keydown="onItemKeydown($event, index)"
      >
        <span class="llm-provider-select__option-label">{{ option.label }}</span>
        <UIcon
          v-if="option.id === modelValue"
          class="llm-provider-select__option-check"
          name="i-lucide-check"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProviderType } from '@store/agent'
import { useAgentStore } from '@store/agent'
import {
  LLM_PROVIDER_SETTINGS_OPTIONS,
  llmProviderSettingsLabel,
  isProviderType,
} from '@shared/agent/llm-provider-registry'

const props = withDefaults(
  defineProps<{
    modelValue: ProviderType
    disabled?: boolean
    /** When true, changing provider fetches models for the new provider. */
    prefetchModels?: boolean
  }>(),
  {
    disabled: false,
    prefetchModels: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: ProviderType]
}>()

const agentStore = useAgentStore()
const options = LLM_PROVIDER_SETTINGS_OPTIONS

const rootEl = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)
const menuOpen = ref(false)
const highlightIndex = ref(0)
const itemRefs = ref<(HTMLButtonElement | null)[]>([])

const selectedLabel = computed(() => {
  const known = options.find((option) => option.id === props.modelValue)
  if (known) return known.label
  if (isProviderType(props.modelValue)) return llmProviderSettingsLabel(props.modelValue)
  return `${props.modelValue} (unknown)`
})

function setItemRef(el: unknown, index: number) {
  if (el instanceof HTMLButtonElement) {
    itemRefs.value[index] = el
  }
}

function initialHighlightIndex(): number {
  const idx = options.findIndex((option) => option.id === props.modelValue)
  return idx >= 0 ? idx : 0
}

function scrollToHighlight() {
  void nextTick(() => {
    const item = itemRefs.value[highlightIndex.value]
    item?.scrollIntoView({ block: 'nearest' })
  })
}

function moveHighlight(delta: number) {
  const len = options.length
  if (len === 0) return
  highlightIndex.value = (highlightIndex.value + delta + len) % len
  scrollToHighlight()
}

function selectProvider(provider: ProviderType) {
  if (provider === props.modelValue) {
    closeMenu()
    return
  }
  if (props.prefetchModels) {
    void agentStore.fetchModelsForProvider(provider)
  }
  emit('update:modelValue', provider)
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
      selectProvider(options[index]?.id ?? props.modelValue)
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
      selectProvider(options[highlightIndex.value]?.id ?? props.modelValue)
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
  if (props.disabled) return
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
.llm-provider-select {
  position: relative;
  width: 100%;
  min-width: 0;
}

.llm-provider-select__trigger {
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

.llm-provider-select__trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.llm-provider-select__trigger--open {
  border-color: var(--color-primary-500);
}

.llm-provider-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.llm-provider-select__chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
  transition: transform 0.15s;
}

.llm-provider-select__trigger--open .llm-provider-select__chevron {
  transform: rotate(180deg);
}

.llm-provider-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
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

.llm-provider-select__option {
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
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.llm-provider-select__option:hover:not(.llm-provider-select__option--active) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.llm-provider-select__option:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary-500, #6366f1) 55%, transparent);
  outline-offset: -2px;
}

.llm-provider-select__option--active,
.llm-provider-select__option--active:hover {
  background-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 16%,
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--color-primary-500, #6366f1) 40%, var(--ui-border, #e5e7eb));
}

.llm-provider-select__option--active .llm-provider-select__option-label {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-weight: 700;
}

.llm-provider-select__option-label {
  flex: 1;
  min-width: 0;
}

.llm-provider-select__option-check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary-500, #6366f1);
}
</style>
