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
      <span class="sub-agent-bubble__status" :data-status="displayStatus">
        <UIcon
          :name="statusIcon"
          class="sub-agent-bubble__status-icon"
          :class="{ 'sub-agent-bubble__status-icon--spin': statusSpinning }"
          aria-hidden="true"
        />
        {{ statusLabel }}
      </span>
    </header>
    <p v-if="node.task" class="sub-agent-bubble__task">{{ node.task }}</p>
    <p v-if="node.worktreeBranch" class="sub-agent-bubble__worktree">
      <UIcon name="i-lucide-git-branch" class="sub-agent-bubble__worktree-icon" />
      <code>{{ node.worktreeBranch }}</code>
      <span v-if="node.detached" class="sub-agent-bubble__detached">detached</span>
    </p>
    <pre
      v-if="expanded && node.worktreeDiffStat"
      class="sub-agent-bubble__diffstat"
    >{{ node.worktreeDiffStat }}</pre>
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

const displayStatus = computed(() => props.node.status)

const statusLabel = computed(() => {
  switch (displayStatus.value) {
    case 'queued':
      return 'Queued'
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
      return displayStatus.value
  }
})

const statusSpinning = computed(
  () =>
    displayStatus.value === 'running' ||
    displayStatus.value === 'queued' ||
    displayStatus.value === 'awaiting_approval',
)

const statusIcon = computed(() => {
  switch (displayStatus.value) {
    case 'queued':
    case 'running':
    case 'awaiting_approval':
      return 'i-lucide-loader-circle'
    case 'completed':
      return 'i-lucide-check-circle-2'
    case 'failed':
      return 'i-lucide-circle-x'
    case 'cancelled':
      return 'i-lucide-circle-slash'
    default:
      return 'i-lucide-circle'
  }
})

const previewText = computed(() => {
  void chatUiBubbleTextKeepChars.value
  const report = props.node.reportPreview?.trim() || ''
  if (!report) return ''
  const task = props.node.task?.trim() || ''
  // Task is already shown above — don't repeat it as the collapsed preview.
  if (task && (report === task || report.startsWith(task))) return ''
  if (props.isStreaming && props.node.status === 'running') {
    return limitBubbleTextForDisplay(report)
  }
  return report
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}

.sub-agent-bubble__status-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.sub-agent-bubble__status-icon--spin {
  animation: sub-agent-spin 0.8s linear infinite;
}

.sub-agent-bubble__status[data-status='running'],
.sub-agent-bubble__status[data-status='queued'] {
  color: var(--color-primary-500, var(--ui-primary));
}

.sub-agent-bubble__status[data-status='awaiting_approval'] {
  color: var(--color-warning-500, #d97706);
}

.sub-agent-bubble__status[data-status='completed'] {
  color: var(--color-success-600, #16a34a);
}

.sub-agent-bubble__status[data-status='failed'] {
  color: var(--color-error-500, #dc2626);
}

.sub-agent-bubble__status[data-status='cancelled'] {
  color: var(--ui-text-muted);
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

.sub-agent-bubble__worktree {
  margin: 6px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ui-text-muted);
  min-width: 0;
}

.sub-agent-bubble__worktree code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
}

.sub-agent-bubble__worktree-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.sub-agent-bubble__detached {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-primary-500, var(--ui-primary));
}

.sub-agent-bubble__diffstat {
  margin: 6px 0 0;
  padding: 6px 8px;
  font-size: 10px;
  line-height: 1.4;
  white-space: pre-wrap;
  border-radius: 6px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  max-height: 120px;
  overflow: auto;
}

@keyframes sub-agent-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
