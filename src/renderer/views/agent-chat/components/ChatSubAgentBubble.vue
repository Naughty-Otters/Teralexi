<template>
  <article
    class="sub-agent-bubble"
    :class="{
      'sub-agent-bubble--running': node.status === 'running',
      'sub-agent-bubble--compact': !expanded,
      [`sub-agent-bubble--depth-${Math.min(node.depth, 2)}`]: true,
    }"
  >
    <header class="sub-agent-bubble__header">
      <button
        type="button"
        class="sub-agent-bubble__title"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <UIcon name="i-lucide-bot" class="sub-agent-bubble__icon" aria-hidden="true" />
        <span class="sub-agent-bubble__name">{{ node.agentName }}</span>
        <UIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="sub-agent-bubble__chevron"
          aria-hidden="true"
        />
      </button>
      <span class="sub-agent-bubble__status" :data-status="node.status">
        {{ statusLabel }}
      </span>
    </header>
    <p v-if="node.task" class="sub-agent-bubble__task">{{ node.task }}</p>
    <p v-if="!expanded && previewText" class="sub-agent-bubble__preview">
      {{ previewText }}
    </p>
    <p v-if="node.error" class="sub-agent-bubble__error">{{ node.error }}</p>
    <div v-if="expanded && runSections.length" class="sub-agent-bubble__body">
      <article
        v-for="section in runSections"
        :key="section.id"
        class="sub-agent-bubble__section"
        :class="`sub-agent-bubble__section--${section.status}`"
      >
        <ChatBubblePdfExportButton
          v-if="showPdfExportButtons"
          corner
          :markdown="section.bodyMarkdown"
          :section-title="section.title"
          :section-id="section.id"
          :message-id="messageId"
          @exported="onPdfExported"
          @failed="onPdfExportFailed"
        />
        <header class="sub-agent-bubble__section-header">
          <span class="sub-agent-bubble__section-title">{{ section.title }}</span>
        </header>
        <div
          v-if="section.bodyHtml"
          class="sub-agent-bubble__section-body msg-html"
          v-html="section.bodyHtml"
        />
      </article>
    </div>
    <div
      v-if="expanded && visibleChildren.length"
      class="sub-agent-bubble__children"
    >
      <ChatSubAgentBubble
        v-for="child in visibleChildren"
        :key="child.runId"
        :node="child"
        :step-progress-parts="stepProgressParts"
        :markdown="markdown"
        :is-streaming="isStreaming"
        :message-id="messageId"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import type MarkdownIt from 'markdown-it'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import {
  buildStructuredDebugViewFromStepProgress,
  type StepProgressPartInput,
} from '../structuredDebugViewModel'
import {
  stepProgressPartsForRun,
  SUB_AGENT_UI_MAX_DEPTH,
  type SubAgentRunNode,
} from './chat/subAgentRunModel'
import {
  chatUiBubbleTextKeepChars,
  limitBubbleTextForDisplay,
} from '../chatUiSettings'
import { useI18n } from '@renderer/composables/useI18n'

const ChatBubblePdfExportButton = defineAsyncComponent(
  () => import('./ChatBubblePdfExportButton.vue'),
)

const props = defineProps<{
  node: SubAgentRunNode
  stepProgressParts: readonly StepProgressPartInput[]
  markdown: MarkdownIt
  isStreaming?: boolean
  messageId: string
}>()

const expanded = ref(false)
const showPdfExportButtons = ref(false)
const { t } = useI18n()
const toast = useToast()

watch(expanded, (isExpanded) => {
  if (!isExpanded) {
    showPdfExportButtons.value = false
    return
  }
  const schedule =
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (callback: IdleRequestCallback) => window.setTimeout(callback, 1)
  schedule(() => {
    if (expanded.value) showPdfExportButtons.value = true
  })
})

function onPdfExported(_savedPath: string): void {
  toast.add({
    title: t.value.chat.exportBubblePdfSuccess,
    color: 'success',
  })
}

function onPdfExportFailed(error: string): void {
  toast.add({
    title: t.value.chat.exportBubblePdfFailed,
    description: error,
    color: 'error',
  })
}

const statusLabel = computed(() => {
  switch (props.node.status) {
    case 'running':
      return 'Running'
    case 'awaiting_approval':
      return 'Awaiting approval'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'completed':
      return 'Done'
    default:
      return props.node.status
  }
})

const previewText = computed(() => {
  void chatUiBubbleTextKeepChars.value
  const raw = props.node.reportPreview?.trim() || props.node.task?.trim() || ''
  if (!raw) return ''
  if (props.isStreaming && props.node.status === 'running') {
    return limitBubbleTextForDisplay(raw)
  }
  return raw
})

const runSections = computed(() => {
  const parts = stepProgressPartsForRun(props.stepProgressParts, props.node.runId)
  const view = buildStructuredDebugViewFromStepProgress(parts, props.markdown, {
    isStreaming: props.isStreaming === true,
  })
  return view?.sections ?? []
})

const visibleChildren = computed(() =>
  props.node.depth >= SUB_AGENT_UI_MAX_DEPTH ? [] : props.node.children,
)
</script>

<script lang="ts">
export default {
  name: 'ChatSubAgentBubble',
}
</script>

<style scoped>
.sub-agent-bubble {
  border: 1px solid color-mix(in srgb, var(--ui-primary) 22%, var(--ui-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
  padding: 8px 10px;
  margin-top: 6px;
}

.sub-agent-bubble--depth-2 {
  margin-left: 10px;
  border-left: 2px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
}

.sub-agent-bubble__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sub-agent-bubble__title {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
}

.sub-agent-bubble__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-agent-bubble__icon,
.sub-agent-bubble__chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.sub-agent-bubble__status {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}

.sub-agent-bubble__status[data-status='running'] {
  color: var(--color-primary-500, var(--ui-primary));
}

.sub-agent-bubble__status[data-status='failed'] {
  color: var(--color-error-500, #dc2626);
}

.sub-agent-bubble__task,
.sub-agent-bubble__preview {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-agent-bubble__error {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--color-error-600, #dc2626);
}

.sub-agent-bubble__body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-agent-bubble__section {
  position: relative;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  padding: 6px 34px 6px 8px;
}

.sub-agent-bubble__section-header {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-bottom: 4px;
}

.sub-agent-bubble__section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-agent-bubble__section-body {
  font-size: 12px;
}

.sub-agent-bubble__children {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 8px;
  border-left: 2px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
}
</style>
