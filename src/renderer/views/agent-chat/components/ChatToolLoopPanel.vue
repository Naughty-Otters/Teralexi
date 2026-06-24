<template>
  <article
    class="exploring-panel"
    :class="{ 'exploring-panel--active': props.active }"
  >
    <header class="exploring-panel__header">
      <UIcon
        name="i-lucide-compass"
        class="exploring-panel__icon"
        aria-hidden="true"
      />
      <span class="exploring-panel__title">{{ panelTitle }}</span>
      <span class="exploring-panel__status" aria-live="polite">
        {{ statusText }}
      </span>
    </header>

    <div v-if="showFullList && listVisibleItems.length > 0" class="exploring-panel__body exploring-panel__body--list">
      <div
        v-for="item in listVisibleItems"
        :key="item.key"
        class="exploring-panel__item"
      >
        <ChatTerminalMessageBubble
          v-if="item.kind === 'terminal'"
          :part="item.part"
        />
        <ChatToolInvocationRow v-else :part="item.part" compact />
      </div>
      <p v-if="listDroppedCount > 0" class="exploring-panel__dropped">
        {{ listDroppedCount }} earlier tool{{ listDroppedCount === 1 ? '' : 's' }} not shown
      </p>
    </div>

    <div v-else-if="latestDetail" class="exploring-panel__body">
      <p class="exploring-panel__action">{{ latestDetail.action }}</p>

      <dl
        v-if="latestDetail.details.length > 0"
        class="exploring-panel__details"
      >
        <div
          v-for="field in latestDetail.details"
          :key="field.label"
          class="exploring-panel__detail-row"
        >
          <dt class="exploring-panel__detail-label">{{ field.label }}</dt>
          <dd class="exploring-panel__detail-value">{{ field.value }}</dd>
        </div>
      </dl>

      <div
        v-if="latestDetail.command"
        class="exploring-panel__command"
      >
        <span class="exploring-panel__command-label">Running</span>
        <p class="exploring-panel__command-text">{{ latestDetail.command }}</p>
      </div>

      <div
        v-if="latestDetail.result"
        class="exploring-panel__outcome"
      >
        <p
          v-if="latestDetail.result.headline"
          class="exploring-panel__headline"
        >
          {{ latestDetail.result.headline }}
        </p>
        <ul
          v-if="latestDetail.result.bullets?.length"
          class="exploring-panel__list"
        >
          <li
            v-for="(item, index) in latestDetail.result.bullets"
            :key="`${item}-${index}`"
          >
            {{ item }}
          </li>
        </ul>
        <p
          v-if="latestDetail.result.note"
          class="exploring-panel__note"
        >
          {{ latestDetail.result.note }}
        </p>
      </div>

      <p
        v-else-if="latestDetail.running"
        class="exploring-panel__pending"
        aria-live="polite"
      >
        Working on it…
      </p>

      <p
        v-if="latestDetail.error"
        class="exploring-panel__error"
        role="alert"
      >
        {{ latestDetail.error }}
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { ChatUiToolCallListDisplay } from '@shared/agent/tool-call-list-display'
import { EXPLORING_PANEL_TITLE } from '@shared/agent/agentic-run-labels'
import {
  formatToolHumanReadableAction,
} from '@shared/tool-result/tool-human-readable'
import {
  formatToolExploringCommand,
  formatToolExploringDetails,
  formatToolExploringResult,
  type ExploringField,
  type ExploringResult,
} from '@shared/tool-result/tool-exploring-display'
import { computed } from 'vue'
import ChatTerminalMessageBubble from './ChatTerminalMessageBubble.vue'
import ChatToolInvocationRow from './ChatToolInvocationRow.vue'
import type { AssistantBubbleDescriptor } from './chat/assistantBubbleFramework'
import { visibleToolLoopPanelItems } from './chat/toolLoopPanelItems'
import {
  extractTerminalView,
  formatToolOutput,
  getToolPartErrorText,
  getToolPartInput,
  getToolPartOutput,
  getToolPartState,
  isRunningState,
  isTerminalToolRunning,
  parseTodoToolPart,
  toolPartDisplayName,
} from './chat/chatToolPartHelpers'

const props = withDefaults(
  defineProps<{
    items: readonly AssistantBubbleDescriptor[]
    active?: boolean
    /** When `all`, list every tool in this batch; when `latest`, show the most recent only. */
    listDisplay?: ChatUiToolCallListDisplay
  }>(),
  {
    active: false,
    listDisplay: 'all',
  },
)

const panelTitle = EXPLORING_PANEL_TITLE

const showFullList = computed(() => props.listDisplay === 'all')

const listPanelItems = computed(() => visibleToolLoopPanelItems(props.items))

const listVisibleItems = computed(() => listPanelItems.value.visible)

const listDroppedCount = computed(() => listPanelItems.value.droppedCount)

function bubbleItemIsRunning(item: AssistantBubbleDescriptor): boolean {
  if (item.kind === 'terminal') return isTerminalToolRunning(item.part)
  return isRunningState(getToolPartState(item.part))
}

type ExploringToolDetail = {
  action: string
  details: ExploringField[]
  command: string
  result: ExploringResult | null
  error: string
  running: boolean
}

const latestItem = computed((): AssistantBubbleDescriptor | null => {
  if (props.items.length === 0) return null
  return props.items[props.items.length - 1] ?? null
})

const latestDetail = computed((): ExploringToolDetail | null => {
  const item = latestItem.value
  if (!item) return null
  return buildExploringToolDetail(item)
})

function buildExploringToolDetail(
  item: AssistantBubbleDescriptor,
): ExploringToolDetail {
  if (item.kind === 'terminal') {
    const view = extractTerminalView(item.part)
    const running = isTerminalToolRunning(item.part)
    const input = getToolPartInput(item.part)
    const toolName = toolPartDisplayName(item.part)
    return {
      action: formatToolHumanReadableAction(toolName, input),
      details: formatToolExploringDetails(toolName, input),
      command: view.command.trim(),
      result: running
        ? null
        : formatToolExploringResult(
            toolName,
            input,
            getToolPartOutput(item.part),
            view.output.trim(),
          ),
      error: getToolPartErrorText(item.part).trim(),
      running,
    }
  }

  const toolName = toolPartDisplayName(item.part)
  const input = getToolPartInput(item.part)
  const output = getToolPartOutput(item.part)
  const todos = parseTodoToolPart(item.part)
  const running = isRunningState(getToolPartState(item.part))

  if (todos) {
    return {
      action: formatToolHumanReadableAction(toolName, input),
      details: [],
      command: '',
      result: running
        ? null
        : formatToolExploringResult(toolName, input, output),
      error: getToolPartErrorText(item.part).trim(),
      running,
    }
  }

  return {
    action: formatToolHumanReadableAction(toolName, input),
    details: formatToolExploringDetails(toolName, input),
    command: formatToolExploringCommand(input),
    result: running
      ? null
      : formatToolExploringResult(
          toolName,
          input,
          output,
          formatToolOutput(item.part).trim(),
        ),
    error: getToolPartErrorText(item.part).trim(),
    running,
  }
}

const statusText = computed(() => {
  if (showFullList.value) {
    const total = props.items.length
    if (total === 0) {
      return props.active ? 'Looking around…' : 'Finished exploring'
    }
    const running = props.items.filter(bubbleItemIsRunning).length
    if (running > 0) {
      return `${running} of ${total} in progress`
    }
    return `${total} tool${total === 1 ? '' : 's'}`
  }

  const detail = latestDetail.value
  if (detail?.result?.headline) return detail.result.headline
  if (detail?.action) return detail.action
  if (props.active) return 'Looking around…'
  return 'Finished exploring'
})
</script>

<style scoped>
.exploring-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  min-width: var(--chat-response-bubble-min-width, 50%);
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 5%,
    var(--ui-bg-elevated)
  );
  overflow: hidden;
}

.exploring-panel--active {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 32%,
    var(--ui-border)
  );
}

.exploring-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 9px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
  background: transparent;
  font: inherit;
  text-align: left;
}

.exploring-panel--active .exploring-panel__header {
  border-bottom-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 16%,
    var(--ui-border)
  );
}

.exploring-panel__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary-500, #6366f1);
}

.exploring-panel__title {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
}

.exploring-panel__status {
  min-width: 0;
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exploring-panel--active .exploring-panel__status {
  color: var(--color-primary-600, #4f46e5);
}

.exploring-panel__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.exploring-panel__body--list {
  gap: 8px;
}

.exploring-panel__item + .exploring-panel__item {
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
}

.exploring-panel__dropped {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.exploring-panel__action {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--ui-text);
}

.exploring-panel__details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.exploring-panel__detail-row {
  display: grid;
  grid-template-columns: minmax(88px, 34%) 1fr;
  gap: 8px;
  align-items: start;
}

.exploring-panel__detail-label {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted);
}

.exploring-panel__detail-value {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text);
  word-break: break-word;
}

.exploring-panel__command {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 7%,
    var(--ui-bg-elevated)
  );
}

.exploring-panel__command-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.exploring-panel__command-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text);
  word-break: break-word;
}

.exploring-panel__outcome {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 6%,
    var(--ui-bg-elevated)
  );
}

.exploring-panel__headline {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ui-text);
}

.exploring-panel__list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text);
}

.exploring-panel__list li + li {
  margin-top: 4px;
}

.exploring-panel__note {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ui-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.exploring-panel__pending {
  margin: 0;
  font-size: 13px;
  color: var(--color-primary-600, #4f46e5);
}

.exploring-panel__error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--color-error-500, #ef4444) 28%, var(--ui-border));
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 7%, var(--ui-bg-elevated));
  color: var(--color-error-600, #dc2626);
  font-size: 13px;
  line-height: 1.5;
}
</style>
