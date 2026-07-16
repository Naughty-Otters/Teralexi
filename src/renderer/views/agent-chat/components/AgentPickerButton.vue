<template>
  <div ref="rootEl" class="agent-picker">
    <AppIconTooltip :text="triggerTitle">
      <button
        ref="triggerRef"
        type="button"
        class="agent-picker-trigger"
        :class="{ 'agent-picker-trigger--active': menuOpen }"
        :aria-label="triggerTitle"
        :aria-expanded="menuOpen"
        aria-haspopup="listbox"
        @mousedown.prevent
        @click="toggleMenu"
      >
        <UIcon class="agent-picker-trigger-icon" name="i-lucide-bot" />
      </button>
    </AppIconTooltip>
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
        <template v-for="row in renderRows" :key="row.key">
          <div
            v-if="row.type === 'section'"
            class="agent-picker-section"
            :class="{ 'agent-picker-section--group': row.variant === 'group' }"
            :style="row.accent ? { '--agent-accent': row.accent } : undefined"
          >
            <UIcon
              v-if="row.variant === 'group'"
              class="agent-picker-section__icon"
              name="i-lucide-layers"
              aria-hidden="true"
            />
            <span class="agent-picker-section__label">{{ row.label }}</span>
            <span
              v-if="row.count"
              class="agent-picker-section__count"
              aria-hidden="true"
              >{{ row.count }}</span
            >
          </div>
          <button
            v-else
            :ref="(el) => setItemRef(el, row.selectableIdx)"
            type="button"
            class="agent-picker-option"
            :class="{
              'agent-picker-option--active': row.selectableIdx === highlightIndex,
              'agent-picker-option--grouped': row.underHeader,
              'agent-picker-option--first': row.first,
              'agent-picker-option--last': row.last,
            }"
            :style="{ '--agent-accent': row.accent }"
            role="option"
            :aria-selected="row.option.id === selectedAgentId"
            :title="rowTitle(row.option)"
            @mousedown.prevent
            @pointerdown.stop
            @mouseenter="setHighlightIndex(row.selectableIdx)"
            @mousemove="setHighlightIndex(row.selectableIdx)"
            @click.stop="selectAgent(row.option.id)"
            @keydown="onItemKeydown($event, row.selectableIdx)"
          >
            <span
              v-if="row.underHeader"
              class="agent-picker-option__rail"
              aria-hidden="true"
            />
            <span class="agent-picker-option__dot" aria-hidden="true" />
            <span class="agent-picker-option__name">{{ row.label }}</span>
            <UIcon
              v-if="row.option.id === selectedAgentId"
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
import AppIconTooltip from '@renderer/components/AppIconTooltip.vue'
import {
  agentPickerRowLabel,
  buildAgentPickerEntries,
  listSelectableAgentPickerOptions,
  type AgentPickerAgentOption,
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

type SectionRow = {
  type: 'section'
  key: string
  variant: 'plain' | 'group'
  label: string
  accent?: string
  count?: number
}

type AgentRow = {
  type: 'agent'
  key: string
  option: AgentPickerAgentOption
  label: string
  selectableIdx: number
  underHeader: boolean
  accent: string
  first: boolean
  last: boolean
}

type RenderRow = SectionRow | AgentRow

const DEFAULT_ACCENT = 'var(--ui-text-muted)'

/** Map an agent color token to a concrete accent color for dots and rails. */
function accentFor(color?: string | null): string {
  switch (color) {
    case 'primary':
      return 'var(--color-primary-500, #6366f1)'
    case 'secondary':
      return 'var(--color-secondary-500, #8b5cf6)'
    case 'success':
      return 'var(--color-success-500, #22c55e)'
    case 'info':
      return 'var(--color-info-500, #3b82f6)'
    case 'warning':
      return 'var(--color-warning-500, #f59e0b)'
    case 'error':
      return 'var(--color-error-500, #ef4444)'
    default:
      return DEFAULT_ACCENT
  }
}

const hasGroups = computed(() =>
  pickerEntries.value.some((entry) => entry.kind === 'header'),
)

/**
 * Flatten picker entries into renderable rows: a leading "Agents" section for
 * ungrouped agents (only when groups also exist), group headers with an accent
 * inherited from the primary variant, and agent rows that know whether they sit
 * under a group header (so we can draw the sub-agent rail + first/last corners).
 */
const renderRows = computed((): RenderRow[] => {
  const entries = pickerEntries.value
  const rows: RenderRow[] = []
  let selectable = 0
  let currentGroupId: string | null = null
  let currentAccent = DEFAULT_ACCENT
  let leadingSectionAdded = false

  entries.forEach((entry) => {
    if (entry.kind === 'header') {
      currentGroupId = entry.groupId
      currentAccent = accentFor(entry.color)
      rows.push({
        type: 'section',
        key: `header:${entry.groupId}`,
        variant: 'group',
        label: entry.label,
        accent: currentAccent,
        count: entry.count,
      })
      return
    }

    const option = entry.option
    const underHeader =
      currentGroupId != null && option.skillGroup === currentGroupId
    if (!underHeader) currentGroupId = null

    if (!underHeader && !leadingSectionAdded && hasGroups.value) {
      rows.push({
        type: 'section',
        key: 'section:agents',
        variant: 'plain',
        label: 'Agents',
      })
      leadingSectionAdded = true
    }

    rows.push({
      type: 'agent',
      key: option.id,
      option,
      label: agentPickerRowLabel(option, underHeader),
      selectableIdx: selectable++,
      underHeader,
      accent: underHeader ? currentAccent : accentFor(option.color),
      first: false,
      last: false,
    })
  })

  // Mark first/last agent rows within each grouped run for rail corners.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.type !== 'agent' || !row.underHeader) continue
    const prev = rows[i - 1]
    const next = rows[i + 1]
    row.first = !prev || prev.type === 'section'
    row.last = !next || next.type !== 'agent' || !next.underHeader
  }

  return rows
})

function rowTitle(option: AgentPickerAgentOption): string {
  return option.description
    ? `${option.displayName} — ${option.description}`
    : option.displayName
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

.agent-picker-section {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  user-select: none;
}

.agent-picker-section:not(:first-child) {
  margin-top: 4px;
}

.agent-picker-section--group {
  color: color-mix(in srgb, var(--agent-accent, var(--ui-text-muted)) 78%, var(--ui-text));
}

.agent-picker-section__icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--agent-accent, var(--ui-text-muted));
}

.agent-picker-section__label {
  flex: 1;
  min-width: 0;
}

.agent-picker-section__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--agent-accent, var(--ui-text-muted));
  background: color-mix(in srgb, var(--agent-accent, var(--ui-text-muted)) 16%, transparent);
}

.agent-picker-option {
  position: relative;
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
  padding-left: 26px;
}

/* Vertical tree rail connecting sub-agent variants to their group. */
.agent-picker-option__rail {
  position: absolute;
  left: 13px;
  top: 0;
  bottom: 0;
  width: 12px;
  pointer-events: none;
}

.agent-picker-option__rail::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-left: 1.5px solid
    color-mix(in srgb, var(--agent-accent, var(--ui-border)) 40%, var(--ui-border));
}

.agent-picker-option__rail::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 9px;
  border-top: 1.5px solid
    color-mix(in srgb, var(--agent-accent, var(--ui-border)) 40%, var(--ui-border));
}

.agent-picker-option--first .agent-picker-option__rail::before {
  top: 50%;
}

.agent-picker-option--last .agent-picker-option__rail::before {
  bottom: 50%;
}

.agent-picker-option__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--agent-accent, var(--ui-text-muted));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--agent-accent, var(--ui-text-muted)) 14%, transparent);
}

.agent-picker-option:hover:not(.agent-picker-option--active) {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
}

.agent-picker-option--active,
.agent-picker-option--active:hover {
  background-color: color-mix(
    in srgb,
    var(--agent-accent, var(--color-primary-500, #6366f1)) 16%,
    transparent
  );
  box-shadow: inset 0 0 0 1px
    color-mix(
      in srgb,
      var(--agent-accent, var(--color-primary-500, #6366f1)) 45%,
      var(--ui-border, #e5e7eb)
    );
}

.agent-picker-option--active .agent-picker-option__name {
  color: color-mix(in srgb, var(--agent-accent, var(--color-primary-500, #6366f1)) 82%, var(--ui-text));
  font-weight: 700;
}

.agent-picker-option__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-picker-option__check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--agent-accent, var(--color-primary-500, #6366f1));
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
