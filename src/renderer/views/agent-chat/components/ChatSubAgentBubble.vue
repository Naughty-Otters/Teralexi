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
    <p v-if="node.worktreeBranch && !worktreeResolved" class="sub-agent-bubble__worktree">
      <UIcon name="i-lucide-git-branch" class="sub-agent-bubble__worktree-icon" />
      <code>{{ node.worktreeBranch }}</code>
      <span v-if="node.detached" class="sub-agent-bubble__detached">detached</span>
    </p>
    <p v-else-if="worktreeResolved && worktreeOutcome" class="sub-agent-bubble__worktree-resolved">
      <UIcon :name="worktreeOutcomeIcon" class="sub-agent-bubble__worktree-icon" />
      <span>{{ worktreeOutcome }}</span>
    </p>
    <pre
      v-if="expanded && node.worktreeDiffStat && !worktreeResolved"
      class="sub-agent-bubble__diffstat"
    >{{ node.worktreeDiffStat }}</pre>
    <div
      v-if="showWorktreeActions"
      class="sub-agent-bubble__actions"
      role="group"
      aria-label="Worktree actions"
    >
      <button
        type="button"
        class="sub-agent-bubble__action sub-agent-bubble__action--primary"
        :disabled="!!actionBusy"
        @click="runWorktreeAction('merge')"
      >
        <UIcon
          v-if="actionBusy === 'merge'"
          name="i-lucide-loader-circle"
          class="sub-agent-bubble__action-spin"
        />
        <UIcon v-else name="i-lucide-git-merge" class="sub-agent-bubble__action-icon" />
        Merge
      </button>
      <button
        type="button"
        class="sub-agent-bubble__action"
        :disabled="!!actionBusy"
        @click="runWorktreeAction('open_pr')"
      >
        <UIcon
          v-if="actionBusy === 'open_pr'"
          name="i-lucide-loader-circle"
          class="sub-agent-bubble__action-spin"
        />
        <UIcon v-else name="i-lucide-git-pull-request" class="sub-agent-bubble__action-icon" />
        Open PR
      </button>
      <button
        type="button"
        class="sub-agent-bubble__action sub-agent-bubble__action--danger"
        :disabled="!!actionBusy"
        @click="runWorktreeAction('discard')"
      >
        <UIcon
          v-if="actionBusy === 'discard'"
          name="i-lucide-loader-circle"
          class="sub-agent-bubble__action-spin"
        />
        <UIcon v-else name="i-lucide-trash-2" class="sub-agent-bubble__action-icon" />
        Discard
      </button>
    </div>
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
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
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
import {
  markSubAgentWorktreeResolved,
  subAgentWorktreeResolvedMap,
  syncSubAgentWorktreeResolvedFromIpc,
} from '../subAgentWorktreeState'

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
const actionBusy = ref<'merge' | 'discard' | 'open_pr' | null>(null)
const localOutcome = ref<'merged' | 'discarded' | null>(null)
const { t } = useI18n()
const toast = useToast()

const worktreeResolved = computed(() => {
  void subAgentWorktreeResolvedMap()[props.node.runId]
  return Boolean(subAgentWorktreeResolvedMap()[props.node.runId])
})

const worktreeOutcome = computed(() => {
  if (localOutcome.value === 'merged') return 'Merged into workspace'
  if (localOutcome.value === 'discarded') return 'Worktree discarded'
  if (worktreeResolved.value) return 'Worktree resolved'
  return ''
})

const worktreeOutcomeIcon = computed(() =>
  localOutcome.value === 'discarded'
    ? 'i-lucide-trash-2'
    : 'i-lucide-check-circle-2',
)

const showWorktreeActions = computed(
  () =>
    Boolean(props.node.worktreeBranch) &&
    !worktreeResolved.value &&
    props.node.status !== 'running' &&
    props.node.status !== 'queued',
)

onMounted(() => {
  if (props.node.worktreeBranch) {
    void syncSubAgentWorktreeResolvedFromIpc(props.node.runId)
  }
})

watch(
  () => props.node.runId,
  (runId) => {
    if (props.node.worktreeBranch) {
      void syncSubAgentWorktreeResolvedFromIpc(runId)
    }
  },
)

async function runWorktreeAction(
  action: 'merge' | 'discard' | 'open_pr',
): Promise<void> {
  if (worktreeResolved.value && (action === 'merge' || action === 'discard')) {
    return
  }
  const ch = window.ipcRendererChannel?.ResolveSubAgentWorktree
  if (!ch?.invoke) {
    toast.add({ title: 'Worktree actions unavailable', color: 'error' })
    return
  }
  actionBusy.value = action
  try {
    const result = await ch.invoke({
      runId: props.node.runId,
      action,
      title: `Sub-agent: ${props.node.agentName}`,
      body: props.node.task || props.node.reportPreview || undefined,
    })
    if (!result?.ok) {
      // Already resolved on the main process (e.g. remount after merge).
      const missing =
        /no isolated worktree/i.test(result?.error ?? '') ||
        /not found/i.test(result?.error ?? '')
      if (missing && (action === 'merge' || action === 'discard')) {
        markSubAgentWorktreeResolved(props.node.runId)
        localOutcome.value = action === 'merge' ? 'merged' : 'discarded'
        return
      }
      toast.add({
        title: result?.error || 'Worktree action failed',
        color: 'error',
      })
      return
    }
    if (action === 'discard' || action === 'merge') {
      markSubAgentWorktreeResolved(props.node.runId)
      localOutcome.value = action === 'merge' ? 'merged' : 'discarded'
    }
    toast.add({
      title:
        action === 'open_pr'
          ? result.url || result.message || 'PR created'
          : result.message || 'Done',
      color: 'success',
    })
  } finally {
    actionBusy.value = null
  }
}

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

const displayStatus = computed(() => {
  if (worktreeResolved.value) {
    if (localOutcome.value === 'discarded') return 'cancelled' as const
    return 'completed' as const
  }
  return props.node.status
})

const statusLabel = computed(() => {
  if (worktreeResolved.value) {
    if (localOutcome.value === 'merged') return 'Merged'
    if (localOutcome.value === 'discarded') return 'Discarded'
    return 'Done'
  }
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
    !worktreeResolved.value &&
    (displayStatus.value === 'running' ||
      displayStatus.value === 'queued' ||
      displayStatus.value === 'awaiting_approval'),
)

const statusIcon = computed(() => {
  if (worktreeResolved.value) {
    return localOutcome.value === 'discarded'
      ? 'i-lucide-circle-slash'
      : 'i-lucide-check-circle-2'
  }
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

.sub-agent-bubble__worktree-resolved {
  margin: 6px 0 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in srgb, var(--ui-primary) 75%, var(--ui-text));
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

.sub-agent-bubble__actions {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.sub-agent-bubble__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated, var(--ui-bg));
  color: var(--ui-text);
  font-size: 11px;
  font-weight: 550;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.sub-agent-bubble__action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-elevated, var(--ui-bg)));
  border-color: color-mix(in srgb, var(--ui-border) 70%, var(--ui-text));
}

.sub-agent-bubble__action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sub-agent-bubble__action--primary {
  border-color: color-mix(in srgb, var(--ui-primary) 35%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
  color: color-mix(in srgb, var(--ui-primary) 85%, var(--ui-text));
}

.sub-agent-bubble__action--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border));
}

.sub-agent-bubble__action--danger {
  color: color-mix(in srgb, var(--color-error-600, #dc2626) 85%, var(--ui-text));
  border-color: color-mix(in srgb, var(--color-error-500, #dc2626) 25%, var(--ui-border));
}

.sub-agent-bubble__action--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error-500, #dc2626) 8%, transparent);
}

.sub-agent-bubble__action-icon,
.sub-agent-bubble__action-spin {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.sub-agent-bubble__action-spin {
  animation: sub-agent-spin 0.8s linear infinite;
}

@keyframes sub-agent-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
