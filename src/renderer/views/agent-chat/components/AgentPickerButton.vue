<template>
  <div ref="rootEl" class="agent-picker">
    <button
      ref="triggerRef"
      type="button"
      class="agent-picker-trigger"
      :class="{ 'agent-picker-trigger--active': menuOpen }"
      :title="triggerTitle"
      :aria-expanded="menuOpen"
      aria-haspopup="listbox"
      @mousedown.prevent
      @click="toggleMenu"
    >
      <UIcon class="agent-picker-trigger-icon" name="i-lucide-bot" />
    </button>
    <Teleport to="body">
      <div
        v-if="menuOpen"
        ref="menuRef"
        class="agent-picker-menu"
        :style="menuStyle"
        role="listbox"
        aria-label="Select agent"
        tabindex="-1"
        @pointerdown.stop
      >
        <template v-for="(entry, index) in pickerEntries" :key="entryKey(entry, index)">
          <div
            v-if="entry.kind === 'header'"
            class="agent-picker-group-header"
          >
            {{ entry.label }}
          </div>
          <button
            v-else
            :ref="(el) => setItemRef(el, selectableIndex(index))"
            type="button"
            class="agent-picker-option"
            :class="{
              'agent-picker-option--active':
                selectableIndex(index) === highlightIndex,
              'agent-picker-option--grouped': isGroupedOption(entry, index),
            }"
            role="option"
            :aria-selected="entry.option.id === selectedAgentId"
            @mousedown.prevent
            @pointerdown.stop
            @mouseenter="setHighlightIndex(selectableIndex(index))"
            @mousemove="setHighlightIndex(selectableIndex(index))"
            @click.stop="selectAgent(entry.option.id)"
            @keydown="onItemKeydown($event, selectableIndex(index))"
          >
            <span class="agent-picker-option__name">{{
              agentPickerRowLabel(entry.option, isGroupedOption(entry, index))
            }}</span>
            <UIcon
              v-if="entry.option.id === selectedAgentId"
              class="agent-picker-option__check"
              name="i-lucide-check"
              aria-hidden="true"
            />
          </button>
        </template>
        <p v-if="selectableAgents.length === 0" class="agent-picker-empty">
          No agents enabled
        </p>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  agentPickerRowLabel,
  buildAgentPickerEntries,
  listSelectableAgentPickerOptions,
  type AgentPickerEntry,
  type SkillGroupAgentRef,
} from '@shared/agent/skill-groups'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from 'vue'

const props = defineProps<{
  selectedAgentId: string | null
  /** Flat agent list (legacy) — converted to grouped entries when pickerEntries is omitted. */
  agentOptions?: Array<{ id: string; name: string }>
  /** Pre-built grouped picker rows (preferred). */
  pickerEntries?: AgentPickerEntry[]
  /** Full agent refs for building grouped entries when pickerEntries is omitted. */
  agents?: SkillGroupAgentRef[]
}>()

const highlightIndex = defineModel<number>('highlightIndex', { default: 0 })

const emit = defineEmits<{
  'select-agent': [agentId: string]
  'menu-open-change': [open: boolean]
}>()

const rootEl = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)
const menuOpen = ref(false)
const itemRefs = ref<(HTMLButtonElement | null)[]>([])
const menuStyle = ref<CSSProperties>({})

const pickerEntries = computed((): AgentPickerEntry[] => {
  if (props.pickerEntries?.length) return props.pickerEntries
  if (props.agents?.length) return buildAgentPickerEntries(props.agents)
  if (props.agentOptions?.length) {
    return buildAgentPickerEntries(
      props.agentOptions.map((agent) => ({
        id: agent.id,
        name: agent.name,
      })),
    )
  }
  return []
})

const selectableAgents = computed(() =>
  listSelectableAgentPickerOptions(pickerEntries.value),
)

const selectableIndexByEntryIndex = computed(() => {
  const map = new Map<number, number>()
  let selectable = 0
  pickerEntries.value.forEach((entry, index) => {
    if (entry.kind === 'agent') {
      map.set(index, selectable)
      selectable += 1
    }
  })
  return map
})

function selectableIndex(entryIndex: number): number {
  return selectableIndexByEntryIndex.value.get(entryIndex) ?? 0
}

function entryKey(entry: AgentPickerEntry, index: number): string {
  if (entry.kind === 'header') return `header:${entry.groupId}:${index}`
  return entry.option.id
}

function isGroupedOption(entry: AgentPickerEntry, index: number): boolean {
  if (entry.kind !== 'agent' || !entry.option.skillGroup) return false
  const prev = pickerEntries.value[index - 1]
  return prev?.kind === 'header'
}

const selectedDisplayName = computed(() => {
  const selected = selectableAgents.value.find(
    (agent) => agent.id === props.selectedAgentId,
  )
  if (selected) return selected.displayName
  const legacy = props.agentOptions?.find(
    (agent) => agent.id === props.selectedAgentId,
  )
  return legacy?.name ?? 'Select agent'
})

const triggerTitle = computed(() =>
  props.selectedAgentId
    ? `Agent: ${selectedDisplayName.value} (change)`
    : 'Select agent',
)

function updateMenuPosition(): void {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  menuStyle.value = {
    left: `${Math.max(8, rect.left)}px`,
    bottom: `${Math.max(8, window.innerHeight - rect.top + 6)}px`,
    minWidth: `${Math.max(rect.width, 220)}px`,
  }
}

function bindMenuPositionListeners(): void {
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
}

function unbindMenuPositionListeners(): void {
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
}

function setItemRef(el: unknown, index: number) {
  if (el instanceof HTMLButtonElement) {
    itemRefs.value[index] = el
  }
}

function setHighlightIndex(index: number) {
  highlightIndex.value = index
}

function initialHighlightIndex(): number {
  const idx = selectableAgents.value.findIndex(
    (agent) => agent.id === props.selectedAgentId,
  )
  return idx >= 0 ? idx : 0
}

function scrollToHighlight() {
  void nextTick(() => {
    const item = itemRefs.value[highlightIndex.value]
    item?.scrollIntoView({ block: 'nearest' })
  })
}

function moveHighlight(delta: number) {
  const len = selectableAgents.value.length
  if (len === 0) return
  highlightIndex.value = (highlightIndex.value + delta + len) % len
  scrollToHighlight()
}

function selectHighlighted() {
  const agent = selectableAgents.value[highlightIndex.value]
  if (agent) selectAgent(agent.id)
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
      selectAgent(selectableAgents.value[index]?.id ?? '')
      break
    case 'Escape':
      event.preventDefault()
      closeMenu()
      break
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (!menuOpen.value || selectableAgents.value.length === 0) return
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
      selectHighlighted()
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
  bindMenuPositionListeners()
  void nextTick(() => {
    updateMenuPosition()
    scrollToHighlight()
  })
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  unbindMenuPositionListeners()
  triggerRef.value?.focus()
}

function selectAgent(agentId: string) {
  if (!agentId) return
  emit('select-agent', agentId)
  closeMenu()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return
  const target = event.target as Node
  if (rootEl.value?.contains(target)) return
  if (menuRef.value?.contains(target)) return
  closeMenu()
}

watch(menuOpen, (open) => {
  emit('menu-open-change', open)
})

watch(
  () => selectableAgents.value.length,
  (len) => {
    itemRefs.value = []
    if (menuOpen.value && highlightIndex.value >= len) {
      highlightIndex.value = Math.max(0, len - 1)
    }
  },
)

watch(highlightIndex, () => {
  if (menuOpen.value) scrollToHighlight()
})

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown, true)
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  unbindMenuPositionListeners()
  document.removeEventListener('keydown', onDocumentKeydown, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})

defineExpose({
  openMenu,
  closeMenu,
  scrollToHighlight,
  menuOpen,
  selectableAgents,
})
</script>

<style scoped>
.agent-picker {
  position: relative;
  flex-shrink: 0;
}

.agent-picker-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.agent-picker-trigger:hover {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
  color: var(--ui-text);
}

.agent-picker-trigger--active {
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 14%, transparent);
  color: var(--color-primary-500, #6366f1);
}

.agent-picker-trigger-icon {
  width: 16px;
  height: 16px;
}

.agent-picker-menu {
  position: fixed;
  z-index: 200;
  pointer-events: auto;
  max-width: min(300px, calc(100vw - 16px));
  max-height: min(280px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  box-shadow:
    0 4px 6px color-mix(in srgb, var(--ui-text) 8%, transparent),
    0 12px 28px color-mix(in srgb, var(--ui-text) 14%, transparent);
}

.agent-picker-group-header {
  padding: 6px 10px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  user-select: none;
}

.agent-picker-option {
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

.agent-picker-option--grouped {
  padding-left: 18px;
}

.agent-picker-option:hover:not(.agent-picker-option--active) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.agent-picker-option--active,
.agent-picker-option--active:hover {
  background-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 18%,
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--color-primary-500, #6366f1) 45%, var(--ui-border, #e5e7eb));
}

.agent-picker-option--active .agent-picker-option__name {
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  font-weight: 700;
}

.agent-picker-option__name {
  flex: 1;
  min-width: 0;
}

.agent-picker-option__check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary-500, #6366f1);
  opacity: 0.72;
}

.agent-picker-option--active .agent-picker-option__check {
  opacity: 1;
}

.agent-picker-empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
</style>
