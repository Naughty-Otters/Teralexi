<template>
  <div class="ta">
    <div class="ta__head">
      <span class="ta__label">Tool approval</span>
      <code v-if="!showCommandPreview" class="ta__tool">{{ displayName }}</code>
    </div>
    <p class="ta__hint">{{ hint }}</p>

    <div v-if="showPlanPreview" class="ta__plan">
      <p v-if="planPreviewLoading" class="ta__plan-status">Loading plan…</p>
      <p v-else-if="planPreviewError" class="ta__plan-error">{{ planPreviewError }}</p>
      <template v-else-if="planPreview">
        <p v-if="planPreview.agentSummary" class="ta__plan-summary">
          {{ planPreview.agentSummary }}
        </p>
        <p class="ta__plan-path">
          <code>{{ planPreview.planFilePath }}</code>
        </p>
        <ChatTodoChecklist
          v-if="planPreview.todos.length > 0"
          :todos="planPreview.todos"
        />
        <div
          class="ta__plan-markdown msg-html"
          v-html="planMarkdownHtml"
        />
      </template>
    </div>

    <FileChangeStack
      v-if="showFilePreview"
      label="Proposed changes"
      :files="previewFiles"
      :error="previewError"
      :loading="previewLoading"
      compact
    />

    <!-- Command/terminal tools: show what will run, not just raw JSON params. -->
    <div v-if="showCommandPreview" class="ta__command terminal-panel">
      <div class="terminal-panel__head">
        <UIcon
          name="i-lucide-terminal"
          class="terminal-panel__head-icon"
          aria-hidden="true"
        />
        <div class="terminal-panel__head-title">
          <span class="terminal-panel__tool">{{ displayName }}</span>
          <span class="terminal-panel__muted">· pending approval</span>
        </div>
      </div>
      <div class="terminal-panel__body terminal-panel__body--flush">
        <ShikiCodeBlock
          :code="commandText"
          :language="commandLanguage"
          variant="terminal-command"
        />
      </div>
    </div>

    <details v-if="inputText && !showPlanPreview" class="ta__slot">
      <summary>Parameters</summary>
      <pre class="ta__code"><code>{{ inputPreview }}</code></pre>
    </details>

    <label v-if="showDenyFeedback" class="ta__feedback">
      <span class="ta__feedback-label">Feedback for the agent</span>
      <textarea
        v-model="denyFeedback"
        class="ta__feedback-input"
        rows="2"
        placeholder="Explain why you denied this tool call…"
      />
    </label>

    <div class="ta__actions">
      <UButton
        size="sm"
        color="primary"
        class="cp-btn-primary cp-btn-sm"
        @click="respond(true)"
      >
        Approve
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        class="cp-btn-secondary cp-btn-sm"
        :title="`Always approve ${displayName} for this conversation`"
        @click="respond(true, true)"
      >
        Approve for session
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        class="cp-btn-secondary cp-btn-sm"
        @click="onDenyClick"
      >
        {{ showDenyFeedback ? 'Confirm deny' : 'Deny' }}
      </UButton>
      <UButton
        v-if="showDenyFeedback"
        size="sm"
        color="neutral"
        variant="ghost"
        class="cp-btn-secondary cp-btn-sm"
        @click="showDenyFeedback = false"
      >
        Cancel
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { useFileChangePreview } from './file-change/useFileChangePreview'
import { usePlanApprovalPreview } from './planning/usePlanApprovalPreview'
import ChatTodoChecklist from './ChatTodoChecklist.vue'
import '@renderer/components/code/terminal-theme.css'
import {
  guessLanguageFromCode,
  languageForTerminalSlot,
} from '@renderer/lib/shiki/guess-language'

const FileChangeStack = defineAsyncComponent(
  () => import('./file-change/FileChangeStack.vue'),
)
const ShikiCodeBlock = defineAsyncComponent(
  () => import('@renderer/components/code/ShikiCodeBlock.vue'),
)
import {
  extractTerminalView,
  formatToolInput,
  getToolPartInput,
  isExitPlanModeToolPart,
  isFileChangeToolPart,
  isTerminalCommandToolPart,
  toolPartDisplayName,
  truncateDisplay,
} from './chat/chatToolPartHelpers'

const planMarkdownRenderer = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

const props = defineProps<{
  part: unknown
  conversationId?: string | null
}>()

const displayName = computed(() => toolPartDisplayName(props.part))
const showFilePreview = computed(() => isFileChangeToolPart(props.part))
const toolInput = computed(() => getToolPartInput(props.part))

const { files: previewFiles, error: previewError, loading: previewLoading } =
  useFileChangePreview(displayName, toolInput)

const inputText = computed(() => formatToolInput(props.part))
const inputPreview = computed(() => truncateDisplay(inputText.value, 14_000))

const showPlanPreview = computed(() => isExitPlanModeToolPart(props.part))

const agentSummary = computed(() => {
  const input = toolInput.value
  if (!input || typeof input !== 'object') return undefined
  const summary = (input as { summary?: unknown }).summary
  return typeof summary === 'string' ? summary.trim() : undefined
})

const {
  preview: planPreview,
  error: planPreviewError,
  loading: planPreviewLoading,
} = usePlanApprovalPreview(showPlanPreview, () => props.conversationId, agentSummary)

const planMarkdownHtml = computed(() => {
  const md = planPreview.value?.planMarkdown?.trim()
  if (!md) return ''
  return planMarkdownRenderer.render(md)
})

const showCommandPreview = computed(
  () =>
    !showFilePreview.value &&
    !showPlanPreview.value &&
    isTerminalCommandToolPart(props.part),
)
const commandText = computed(() =>
  truncateDisplay(extractTerminalView(props.part).command, 14_000),
)
const commandLanguage = computed(() =>
  guessLanguageFromCode(commandText.value, languageForTerminalSlot('command')),
)

const hint = computed(() => {
  if (showPlanPreview.value) {
    return 'Review the implementation plan below before approving execution.'
  }
  if (showFilePreview.value) {
    return 'Review the proposed file changes below. Approve only if you are comfortable applying them.'
  }
  if (showCommandPreview.value) {
    return 'Review the command below. Approve only if you are comfortable running it.'
  }
  return 'Review the tool parameters below before approving.'
})

const showDenyFeedback = ref(false)
const denyFeedback = ref('')

const emit = defineEmits<{
  respond: [payload: { approved: boolean; approveForSession?: boolean; feedback?: string }]
}>()

function respond(approved: boolean, approveForSession = false) {
  emit('respond', {
    approved,
    approveForSession,
    feedback: !approved ? denyFeedback.value.trim() || undefined : undefined,
  })
  showDenyFeedback.value = false
  denyFeedback.value = ''
}

function onDenyClick() {
  if (!showDenyFeedback.value) {
    showDenyFeedback.value = true
    return
  }
  respond(false)
}
</script>

<style scoped>
.ta {
  background: transparent;
  padding: 0;
  max-width: 100%;
}
.ta__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin-bottom: 6px;
}
.ta__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}
.ta__tool {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--app-font-family);
  word-break: break-word;
}
.ta__hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
}
.ta__plan {
  margin: 0 0 12px;
}
.ta__plan-status,
.ta__plan-error {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.ta__plan-error {
  color: var(--ui-error, #c2410c);
}
.ta__plan-summary {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text);
}
.ta__plan-path {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--ui-text-muted);
}
.ta__plan-path code {
  font-family: var(--app-font-family);
}
.ta__plan-markdown {
  margin-top: 10px;
  padding: 10px 12px;
  max-height: 360px;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--ui-border) 85%, transparent);
  background: color-mix(in srgb, var(--ui-text) 4%, transparent);
  font-size: 13px;
  line-height: 1.5;
}
.ta__command {
  margin: 0 0 10px;
}
.ta__command .terminal-panel__body--flush :deep(.shiki-surface) {
  margin: 0;
  border: none;
  border-radius: 0;
}
.ta__slot {
  margin: 10px 0 0;
}
.ta__slot summary {
  cursor: pointer;
  list-style: none;
  padding: 0 0 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted);
  user-select: none;
}
.ta__slot summary::-webkit-details-marker { display: none; }
.ta__slot summary:hover {
  color: var(--ui-text);
}
.ta__code {
  margin: 0 0 12px;
  padding: 10px 11px;
  max-height: 200px;
  overflow: auto;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  font-family: var(--app-font-family);
  color: var(--ui-text);
  background: color-mix(in srgb, var(--ui-text) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-border) 85%, transparent);
}
.ta__feedback {
  display: block;
  margin: 10px 0 0;
}
.ta__feedback-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted);
}
.ta__feedback-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border);
  font-size: 12px;
  line-height: 1.45;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-bg);
  resize: vertical;
}
.ta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
}
</style>
