<template>
  <article
    class="tool-loop-panel"
    :class="{
      'tool-loop-panel--active': props.active,
      'tool-loop-panel--expanded': expanded,
    }"
  >
    <button
      type="button"
      class="tool-loop-panel__header"
      :aria-expanded="expanded"
      :title="expanded ? 'Collapse tool calls' : 'Expand tool calls'"
      @click="toggleExpanded"
    >
      <UIcon
        name="i-lucide-wrench"
        class="tool-loop-panel__icon"
        aria-hidden="true"
      />
      <span class="tool-loop-panel__title">{{ title }}</span>
      <span class="tool-loop-panel__count">{{ itemCount }}</span>
      <span class="tool-loop-panel__header-end">
        <span
          v-if="props.active"
          class="tool-loop-panel__status"
          aria-live="polite"
        >
          Running
        </span>
        <UIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="tool-loop-panel__chevron"
          aria-hidden="true"
        />
      </span>
    </button>

    <template v-if="expanded">
      <p v-if="droppedEarlierCount > 0" class="tool-loop-panel__hint">
        +{{ droppedEarlierCount }} earlier tools omitted
      </p>

      <div
        ref="scrollEl"
        class="tool-loop-panel__body"
        role="log"
        aria-live="polite"
        aria-label="Agent tool calls"
      >
        <template
          v-for="entry in visibleItemsWithState"
          :key="entry.item.key"
        >
          <ChatTerminalMessageBubble
            v-if="entry.item.kind === 'terminal'"
            :part="entry.item.part"
          />
          <ChatToolInvocationRow
            v-else
            :part="entry.item.part"
            :compact="entry.running"
          />
        </template>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { AGENTIC_RUN_STEP_TITLE } from '@shared/agent/agentic-run-labels'
import { computed, nextTick, ref, watch } from 'vue'
import type { AssistantBubbleDescriptor } from './chat/assistantBubbleFramework'
import {
  getToolPartState,
  isRunningState,
  isTerminalToolRunning,
} from './chat/chatToolPartHelpers'
import ChatTerminalMessageBubble from './ChatTerminalMessageBubble.vue'
import ChatToolInvocationRow from './ChatToolInvocationRow.vue'
import { visibleToolLoopPanelItems } from './chat/toolLoopPanelItems'

const props = withDefaults(
  defineProps<{
    items: readonly AssistantBubbleDescriptor[]
    active?: boolean
  }>(),
  {
    active: false,
  },
)

const scrollEl = ref<HTMLElement | null>(null)
const expanded = ref(false)

const panelWindow = computed(() => visibleToolLoopPanelItems(props.items))

const visibleItems = computed(() => panelWindow.value.visible)
const droppedEarlierCount = computed(() => panelWindow.value.droppedCount)

const visibleItemsWithState = computed(() =>
  visibleItems.value.map((item) => ({
    item,
    running: rowIsRunning(item),
  })),
)

const itemCount = computed(() => props.items.length)
const title = computed(() => AGENTIC_RUN_STEP_TITLE)

function rowIsRunning(item: AssistantBubbleDescriptor): boolean {
  if (item.kind === 'terminal') return isTerminalToolRunning(item.part)
  return isRunningState(getToolPartState(item.part))
}

function toggleExpanded(): void {
  expanded.value = !expanded.value
}

function scrollBodyToEnd(): void {
  const el = scrollEl.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

watch(
  () => [props.items.length, props.active] as const,
  () => {
    if (!props.active || !expanded.value) return
    void nextTick(scrollBodyToEnd)
  },
  { flush: 'post' },
)
</script>

<style scoped>
.tool-loop-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  min-width: var(--chat-response-bubble-min-width, 50%);
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 4%,
    var(--ui-bg-elevated)
  );
  overflow: hidden;
}

.tool-loop-panel--active {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 35%,
    var(--ui-border)
  );
}

.tool-loop-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 7px 10px;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
  cursor: pointer;
  text-align: left;
}

.tool-loop-panel__header:hover {
  color: var(--ui-text);
}

.tool-loop-panel--active .tool-loop-panel__header {
  color: var(--color-primary-500, #6366f1);
}

.tool-loop-panel__icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.tool-loop-panel__title {
  flex: 0 1 auto;
}

.tool-loop-panel__count {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.tool-loop-panel__status {
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  color: var(--color-primary-500, #6366f1);
}

.tool-loop-panel__header-end {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.tool-loop-panel__chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}

.tool-loop-panel__hint {
  margin: 0;
  padding: 0 10px 6px;
  font-size: 11px;
  color: var(--ui-text-muted);
}

.tool-loop-panel__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(420px, 48vh);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 8px 8px;
  scrollbar-width: thin;
}

.tool-loop-panel__body :deep(.tr),
.tool-loop-panel__body :deep(.term) {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
}
</style>
