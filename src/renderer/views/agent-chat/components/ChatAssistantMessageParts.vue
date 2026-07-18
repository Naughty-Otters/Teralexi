<template>
  <div
    ref="assistantMsgPartsEl"
    class="assistant-msg-parts"
    :class="{
      'assistant-msg-parts--conversation': chatBoxMode() === 'conversation',
    }"
  >
    <div
      v-for="(errorText, errorIndex) in visibleAgentErrors"
      :key="`agent-error-${errorIndex}`"
      class="msg-error"
      role="alert"
      v-html="renderAgentErrorMarkdown(errorText)"
    />
    <template v-for="bubble in visibleReasoningBubbles" :key="bubble.key">
      <details class="reasoning-bubble" open>
        <summary class="reasoning-bubble__summary">
          <UIcon
            name="i-lucide-brain"
            class="reasoning-bubble__icon"
            aria-hidden="true"
          />
          <span>{{ t.chat.thoughtBubbleTitle }}</span>
        </summary>
        <pre class="reasoning-bubble__body">{{ reasoningTextFromPart(bubble.part) }}</pre>
      </details>
    </template>
    <ChatAssistantConversationView
      v-if="useConversationViewForMessage(props.message)"
      :message="props.message"
      @open-preview="onOpenOutputPreview"
    />
    <component
      :is="TimelineView"
      v-else-if="TimelineView && showTimelineViewForMessage(props.message)"
      :message="props.message"
    />
    <template v-else-if="!UI_CHAT_CONVERSATION_MODE_ONLY">
      <template v-for="bubble in briefModeBubbles" :key="bubble.key">
        <ChatBriefMarkdownBubble
          v-if="bubble.kind === 'markdown'"
          :message="props.message"
          :part="bubble.part"
          :html="props.renderTextPartHtml(props.message, bubble.part)"
        />
        <details
          v-else-if="bubble.kind === 'reasoning'"
          class="reasoning-bubble"
          open
        >
          <summary class="reasoning-bubble__summary">
          <UIcon
            name="i-lucide-brain"
            class="reasoning-bubble__icon"
            aria-hidden="true"
          />
          <span>{{ t.chat.thoughtBubbleTitle }}</span>
        </summary>
          <pre class="reasoning-bubble__body">{{ reasoningTextFromPart(bubble.part) }}</pre>
        </details>
        <div
          v-else-if="bubble.kind === 'error'"
          class="msg-error"
          role="alert"
          v-html="renderAgentErrorHtml(bubble.part)"
        />
        <ChatStepProgressPanel
          v-else-if="bubble.kind === 'step-progress'"
          :title="agentStepProgressTitle(bubble.part)"
          :html="renderStepProgressBodyHtml(props.message, bubble.part)"
          :output-links="agentStepProgressOutputLinks(bubble.part)"
          :active="agentStepProgressIsActive(bubble.part)"
          :accordion-mode="stepProgressAccordionMode(props.message)"
          :open="
            agentStepProgressShouldBeOpenForMessage(props.message, bubble.part)
          "
          @open-preview="onOpenOutputPreview"
        />
        <ChatListItemsBubble
          v-else-if="bubble.kind === 'list-items'"
          :data="listDataFromBubble(bubble)"
          :state-key="bubble.key"
        />
        <ChatCollectFormCard
          v-else-if="bubble.kind === 'form'"
          :message-id="props.message.id"
          :part="bubble.part"
          :disabled="!props.chatReady"
          @submit="onFormSubmit"
        />
        <ChatToolApprovalCard
          v-else-if="bubble.kind === 'approval'"
          :part="bubble.part"
          :conversation-id="agentStore.currentConversationId"
          @respond="(payload) => onToolApproval(bubble.part, payload)"
        />
        <ChatTerminalMessageBubble
          v-else-if="bubble.kind === 'terminal'"
          :part="bubble.part"
        />
        <ChatToolLoopPanel
          v-else-if="bubble.kind === 'tool-group'"
          :items="toolGroupItems(bubble)"
          :active="toolGroupIsActive(bubble)"
          :list-display="chatUiToolCallListDisplay"
        />
        <ChatToolInvocationRow
          v-else-if="bubble.kind === 'diff' || bubble.kind === 'tool'"
          :part="bubble.part"
        />
      </template>
    </template>
    <template v-for="bubble in structuredHitlBubbles" :key="bubble.key">
      <ChatCollectFormCard
        v-if="bubble.kind === 'form'"
        :message-id="props.message.id"
        :part="bubble.part"
        :disabled="!props.chatReady"
        @submit="onFormSubmit"
      />
      <ChatToolApprovalCard
        v-else-if="bubble.kind === 'approval'"
        :part="bubble.part"
        :conversation-id="agentStore.currentConversationId"
        @respond="(payload) => onToolApproval(bubble.part, payload)"
      />
    </template>
    <div
      v-if="props.showThinkingIndicator"
      class="thinking-strip"
      aria-live="polite"
      :aria-label="
        props.showCatchingUp ? 'Assistant is catching up' : 'Assistant is thinking'
      "
    >
      <UIcon
        name="i-lucide-sparkles"
        class="thinking-strip__icon"
        aria-hidden="true"
      />
      <span class="thinking-strip__label">{{
        props.showCatchingUp ? 'Catching up…' : 'Thinking…'
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UIMessage } from '@teralexi-ai'
import { useI18n } from '@renderer/composables/useI18n'
import ChatAssistantConversationView from './ChatAssistantConversationView.vue'
import ChatBriefMarkdownBubble from './ChatBriefMarkdownBubble.vue'
import {
  type ChatBoxDisplayMode,
  UI_CHAT_CONVERSATION_MODE_ONLY,
  resolveUiChatBoxDisplayMode,
  usesStructuredAssistantRendering,
} from '../chatBoxDisplayMode'
import { assistantStepProgressDisplayTitle } from '@shared/agent/chat-persona'
import ChatCollectFormCard from './ChatCollectFormCard.vue'
import ChatListItemsBubble from './ChatListItemsBubble.vue'
import ChatStepProgressPanel from './ChatStepProgressPanel.vue'
import ChatTerminalMessageBubble from './ChatTerminalMessageBubble.vue'
import ChatToolApprovalCard from './ChatToolApprovalCard.vue'
import ChatToolInvocationRow from './ChatToolInvocationRow.vue'
import ChatToolLoopPanel from './ChatToolLoopPanel.vue'
import {
  type AssistantListBubbleData,
  resolveAssistantBubbles,
  resolveHitlBubbles,
  extractVisibleLlmErrorsFromMessage,
  agentErrorTextFromPart,
  type AssistantBubbleDescriptor,
  type AssistantToolGroupPayload,
  toolGroupHasRunningItem,
} from './chat/assistantBubbleFramework'
import { contentHash } from './chat/assistantHtmlCache'
import { injectCodeCopyButtons } from './chat/streamingMarkdown'
import { useAgentStore } from '@store/agent'
import { resolveDiagramBlocksInHtml } from '@shared/markdown/create-markdown-it'
import { useLazyStandardMarkdown } from '@renderer/composables/useLazyStandardMarkdown'
import { rewriteSandboxPreviewLinksInHtml } from '@shared/markdown/sandbox-preview-links'
import { prepareMarkdownSource } from '@shared/markdown/prepare-markdown-source'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUpdated,
  ref,
  watch,
} from 'vue'

const TimelineView = UI_CHAT_CONVERSATION_MODE_ONLY
  ? null
  : defineAsyncComponent(() => import('./ChatAssistantStructuredDebug.vue'))
import { stepAttachmentsToOutputLinks } from '@shared/agent/step-attachment'
import { applyStatusBadges } from '../assistantStructuredRender'
import {
  stripLegacyOutputsMarkdown,
  type StepOutputLinkView,
} from '../stepOutputLinksRender'
import { hydrateStepOutputLinkPreviews } from '../stepOutputLinkPreviewHydrate'
import { hydrateDiagramBlocks } from '../diagramHydrate'
import {
  activeStepProgressPartKey,
  agentStepProgressShouldBeOpen,
  messageHasRunningStep,
  isPerTaskForeachItemProgress,
  isPerTaskToolLoopProgress,
  stepProgressPartKey,
} from '../stepProgressDisplay'
import { messageHasStructuredDebugTimelineSource } from '../structuredDebugViewModel'
import {
  isAgenticRunStepProgressPart,
  messageFinalTextStarted,
} from '../conversationBubbleDisplay'
import { filterAssistantToolGroupBubbles, shouldShowToolCallLists } from '@shared/agent/tool-call-list-display'
import { filterAssistantReasoningBubbles } from '@shared/agent/thinking-bubble-display'
import { chatUiThinkingBubbleDisplay, chatUiToolCallListDisplay } from '../chatUiSettings'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    message: UIMessage
    renderTextPartHtml: (msg: UIMessage, part: unknown) => string
    chatReady: boolean
    /** True while this assistant message is the active in-flight turn (agent working). */
    showThinkingIndicator?: boolean
    /** True when ingress backlog is being fast-forwarded to the display buffer. */
    showCatchingUp?: boolean
  }>(),
  { showThinkingIndicator: false, showCatchingUp: false },
)

const agentStore = useAgentStore()

const assistantMsgPartsEl = ref<HTMLElement | null>(null)

const stepProgressMarkdown = useLazyStandardMarkdown()

const emit = defineEmits<{
  'collect-form-submit': [
    payload: { requestId: string; values: Record<string, unknown> },
  ]
  'tool-approval': [
    payload: { part: unknown; approved: boolean; approveForSession?: boolean },
  ]
  'open-preview': [url: string]
}>()

function onOpenOutputPreview(url: string) {
  emit('open-preview', url)
}

const usesStructuredAssistantLayoutForMessage = computed(
  () =>
    useConversationViewForMessage(props.message) ||
    showTimelineViewForMessage(props.message),
)

const visibleAgentErrors = computed(() =>
  extractVisibleLlmErrorsFromMessage(props.message),
)

const resolvedBubbles = computed<AssistantBubbleDescriptor[]>(() => {
  if (UI_CHAT_CONVERSATION_MODE_ONLY) return []
  return resolveAssistantBubbles(props.message, {
    structuredLayoutEnabled: showTimelineViewForMessage(props.message),
    shouldShowStepProgress: shouldShowAgentStepProgressPart,
  })
})

const reasoningBubbles = computed(() => {
  if (messageFinalTextStarted(props.message)) return []
  return resolveAssistantBubbles(props.message, {
    structuredLayoutEnabled: false,
    shouldShowStepProgress: () => false,
  }).filter((bubble) => bubble.kind === 'reasoning')
})

const visibleReasoningBubbles = computed(() =>
  filterAssistantReasoningBubbles(
    reasoningBubbles.value,
    chatUiThinkingBubbleDisplay.value,
  ),
)

/** Brief mode: all part types including forms. */
const briefModeBubbles = computed(() => {
  let bubbles = usesStructuredAssistantLayoutForMessage.value
    ? []
    : resolvedBubbles.value
  if (messageFinalTextStarted(props.message)) {
    bubbles = bubbles.filter(
      (bubble) => bubble.kind !== 'reasoning' && bubble.kind !== 'tool-group',
    )
  }
  bubbles = filterAssistantReasoningBubbles(
    bubbles,
    chatUiThinkingBubbleDisplay.value,
  )
  bubbles = filterAssistantToolGroupBubbles(
    bubbles,
    chatUiToolCallListDisplay.value,
  )
  return bubbles
})

/** Conversation/timeline modes: forms and approvals render outside structured views. */
const structuredHitlBubbles = computed(() =>
  usesStructuredAssistantLayoutForMessage.value
    ? resolveHitlBubbles(props.message)
    : [],
)

function assistantMessageTextRaw(message: UIMessage): string {
  const chunks: string[] = []
  for (const part of message.parts) {
    if (part.type === 'text') {
      const text = part.text ?? ''
      if (text.trim()) chunks.push(text)
    }
  }
  return chunks.join('\n\n').trim()
}

function chatBoxMode(): ChatBoxDisplayMode {
  return resolveUiChatBoxDisplayMode()
}

function useConversationViewForMessage(message: UIMessage): boolean {
  if (UI_CHAT_CONVERSATION_MODE_ONLY) return true
  return showConversationViewForMessage(message)
}

function messageEligibleForStructuredLayout(message: UIMessage): boolean {
  if (message.role !== 'assistant') return false
  const progress = listAgentStepProgressParts(message)
  const raw = assistantMessageTextRaw(message)
  if (messageHasStructuredDebugTimelineSource(raw, progress)) return true
  return (
    message.parts.some(
      (part) => part.type === 'text' && part.state === 'streaming',
    ) || messageHasRunningStep(progress)
  )
}

function usesStructuredAssistantLayout(message: UIMessage): boolean {
  if (!usesStructuredAssistantRendering(chatBoxMode())) return false
  return messageEligibleForStructuredLayout(message)
}

function showTimelineViewForMessage(message: UIMessage): boolean {
  return (
    chatBoxMode() === 'timeline' && messageEligibleForStructuredLayout(message)
  )
}

function showConversationViewForMessage(message: UIMessage): boolean {
  return (
    chatBoxMode() === 'conversation' &&
    messageEligibleForStructuredLayout(message)
  )
}

type AgentStepProgressPart = {
  type: 'data-agent-step-progress'
  id?: string
  data?: {
    stepKey?: string
    stepId?: string
    title?: string
    sequence?: number
    status?: string
    content?: string
    summary?: string
    outputLinks?: StepOutputLinkView[]
  }
}

function isAgentStepProgressPart(part: unknown): part is AgentStepProgressPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: string }).type === 'data-agent-step-progress'
  )
}

function hasCompletedAssistantText(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === 'text' &&
      part.state !== 'streaming' &&
      typeof part.text === 'string' &&
      part.text.trim().length > 0,
  )
}

function listAgentStepProgressParts(
  message: UIMessage,
): AgentStepProgressPart[] {
  const out: AgentStepProgressPart[] = []
  for (const part of message.parts) {
    if (!isAgentStepProgressPart(part)) continue
    if (isPerTaskToolLoopProgress(part.data ?? {})) continue
    if (isPerTaskForeachItemProgress(part.data ?? {})) continue
    out.push(part)
  }
  return out
}

function stepProgressAccordionMode(message: UIMessage): boolean {
  return messageHasRunningStep(listAgentStepProgressParts(message))
}

function agentStepProgressShouldBeOpenForMessage(
  message: UIMessage,
  part: unknown,
): boolean {
  if (!isAgentStepProgressPart(part)) return false
  const parts = listAgentStepProgressParts(message)
  return agentStepProgressShouldBeOpen(parts, part, {
    debugMode: chatBoxMode() === 'timeline',
  })
}

/** Prefer terminal pipeline steps once execution has moved past tool work. */
function activeStepProgressPartKeyForMessage(
  message: UIMessage,
): string | null {
  return activeStepProgressPartKey(listAgentStepProgressParts(message))
}

function shouldShowAgentStepProgressPart(
  message: UIMessage,
  part: unknown,
): boolean {
  if (!isAgentStepProgressPart(part)) return false
  if (
    !shouldShowToolCallLists(chatUiToolCallListDisplay.value) &&
    isAgenticRunStepProgressPart(part)
  ) {
    return false
  }
  if (hasCompletedAssistantText(message)) return false
  const activeKey = activeStepProgressPartKeyForMessage(message)
  if (!activeKey) return false
  return stepProgressPartKey(part) === activeKey
}

function agentStepProgressIsActive(part: unknown): boolean {
  return agentStepProgressData(part).status !== 'completed'
}

function agentStepProgressData(part: unknown) {
  return isAgentStepProgressPart(part) ? (part.data ?? {}) : {}
}

function agentStepProgressTitle(_part: unknown): string {
  return assistantStepProgressDisplayTitle()
}

function agentStepProgressText(part: unknown): string {
  const data = agentStepProgressData(part)
  const content = typeof data.content === 'string' ? data.content : ''
  if (content.trim()) return stripLegacyOutputsMarkdown(content)
  const summary = typeof data.summary === 'string' ? data.summary.trim() : ''
  if (summary && data.status === 'completed') return summary
  return stripLegacyOutputsMarkdown(content)
}

function renderAgentErrorHtml(part: unknown): string {
  const raw = agentErrorTextFromPart(part)
  return renderAgentErrorMarkdown(raw)
}

function escapePlainMarkdownFallback(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function renderAgentErrorMarkdown(text: string): string {
  if (!text.trim()) return ''
  const md = stepProgressMarkdown.value
  if (!md) return `<p>${escapePlainMarkdownFallback(text)}</p>`
  return md.render(text)
}

function agentStepProgressOutputLinks(part: unknown): StepOutputLinkView[] {
  const data = agentStepProgressData(part) as {
    attachments?: Array<{ path: string; label: string; url?: string }>
    outputLinks?: StepOutputLinkView[]
  }
  if (data.attachments?.length) {
    return stepAttachmentsToOutputLinks(data.attachments)
  }
  const links = data.outputLinks
  if (!Array.isArray(links)) return []
  return links.filter(
    (link): link is StepOutputLinkView =>
      !!link &&
      typeof link === 'object' &&
      typeof link.label === 'string' &&
      typeof link.url === 'string' &&
      link.url.trim().length > 0,
  )
}

function renderStepProgressBodyHtml(
  message: UIMessage,
  part: unknown,
): string {
  const raw = agentStepProgressText(part)
  const prepared = prepareMarkdownSource(raw)
  if (!prepared) return ''
  const md = stepProgressMarkdown.value
  if (!md) return `<p>${escapePlainMarkdownFallback(prepared)}</p>`
  const html = applyStatusBadges(md.render(prepared))
  return rewriteSandboxPreviewLinksInHtml(resolveDiagramBlocksInHtml(html))
}

async function refreshOutputLinkPreviews(): Promise<void> {
  await nextTick()
  hydrateDiagramBlocks(assistantMsgPartsEl.value)
  await hydrateStepOutputLinkPreviews(assistantMsgPartsEl.value)
}

let lastCodeCopySourceHash = ''

function messageHtmlSourceHash(): string {
  return contentHash(JSON.stringify(props.message.parts))
}

function maybeInjectCodeCopyButtons(): void {
  const hash = messageHtmlSourceHash()
  if (hash === lastCodeCopySourceHash) return
  lastCodeCopySourceHash = hash
  if (assistantMsgPartsEl.value) {
    injectCodeCopyButtons(assistantMsgPartsEl.value)
  }
}

onMounted(() => {
  void refreshOutputLinkPreviews()
  maybeInjectCodeCopyButtons()
})

onUpdated(() => {
  void refreshOutputLinkPreviews()
  maybeInjectCodeCopyButtons()
})

watch(
  () => props.message.parts,
  () => {
    void refreshOutputLinkPreviews()
  },
  { deep: true },
)

function onFormSubmit(payload: {
  requestId: string
  values: Record<string, unknown>
}) {
  emit('collect-form-submit', payload)
}

function onToolApproval(
  part: unknown,
  payload: { approved: boolean; approveForSession?: boolean; feedback?: string },
) {
  emit('tool-approval', { part, ...payload })
}

function listDataFromBubble(
  bubble: AssistantBubbleDescriptor,
): AssistantListBubbleData {
  return bubble.payload as AssistantListBubbleData
}

function reasoningTextFromPart(part: unknown): string {
  if ((part as { type?: string }).type !== 'reasoning') return ''
  return String((part as { text?: string }).text ?? '').trim()
}

function toolGroupItems(
  bubble: AssistantBubbleDescriptor,
): AssistantBubbleDescriptor[] {
  return (bubble.payload as AssistantToolGroupPayload).items
}

function toolGroupIsActive(bubble: AssistantBubbleDescriptor): boolean {
  return toolGroupHasRunningItem(bubble.payload as AssistantToolGroupPayload)
}
</script>

<style scoped>
@import '../step-disclosure.css';
@import '../step-output-links.css';
.assistant-msg-parts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  flex-shrink: 0;
}

/* Brief mode: each response card spans the full chat column. */
.assistant-msg-parts:not(.assistant-msg-parts--conversation)
  > :not(.thinking-strip) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.assistant-msg-parts--conversation {
  gap: 10px;
}
.msg-html :deep(p),
.structured-debug-body :deep(p),
.structured-debug-fallback :deep(p) {
  margin: 0.35em 0;
}
.msg-html :deep(.assistant-content-v2) {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg-html :deep(.assistant-content-block) {
  padding: 0;
  background: transparent;
}
.msg-html :deep(.assistant-content-title) {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}
.msg-html :deep(.assistant-content-body > :first-child) {
  margin-top: 0;
}
.msg-html :deep(.assistant-content-body > :last-child) {
  margin-bottom: 0;
}
.msg-html :deep(.assistant-content-substeps-list) {
  margin: 0;
  padding-left: 0;
  list-style: none;
}
.msg-html :deep(.assistant-content-step-item + .assistant-content-step-item) {
  margin-top: 8px;
}
.msg-html :deep(.task-badge),
.structured-debug-body :deep(.task-badge),
.structured-debug-fallback :deep(.task-badge) {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.6;
  vertical-align: middle;
  font-family: var(--app-font-family);
}
.msg-html :deep(.task-badge--pending) {
  background: var(--ui-bg-accented);
  color: var(--ui-text-muted);
}
.msg-html :deep(.task-badge--running) {
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 15%,
    transparent
  );
  color: var(--color-primary-500, #6366f1);
}
.msg-html :deep(.task-badge--done) {
  background: color-mix(
    in srgb,
    var(--color-success-500, #22c55e) 15%,
    transparent
  );
  color: var(--color-success-500, #22c55e);
}
.msg-html :deep(.task-badge--failed) {
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 15%,
    transparent
  );
  color: var(--color-error-500, #ef4444);
}
.msg-error {
  margin: 0.35em 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-error-500, #ef4444) 35%, transparent);
  background: color-mix(in srgb, var(--color-error-500, #ef4444) 10%, transparent);
  color: var(--color-error-500, #ef4444);
  font-size: 14px;
  line-height: 1.5;
}
.msg-error :deep(p) {
  margin: 0.35em 0;
}
.msg-error :deep(p:first-child) {
  margin-top: 0;
}
.msg-error :deep(p:last-child) {
  margin-bottom: 0;
}
.msg-error :deep(strong) {
  color: inherit;
}
.msg-html :deep(.task-badge--warn) {
  background: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 15%,
    transparent
  );
  color: var(--color-warning-500, #f59e0b);
}
.msg-html :deep(.task-badge--retry) {
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 15%,
    transparent
  );
  color: var(--color-primary-500, #6366f1);
}
.msg-html :deep(.task-badge--task) {
  background: var(--ui-bg-accented);
  color: var(--ui-text-muted);
}
.msg-html :deep(.task-badge--goal) {
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 12%,
    transparent
  );
  color: var(--color-primary-500, #6366f1);
}
.msg-html :deep(.sandbox-preview-link) {
  color: var(--color-primary-500, #6366f1);
  text-decoration: underline;
  cursor: pointer;
}
.msg-html :deep(.assistant-content-step-outputs) {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--ui-border);
}
.msg-html
  :deep(.assistant-content-step-outputs .step-disclosure + .step-disclosure) {
  margin-top: 10px;
}
.msg-html :deep(.step-output-links__list) {
  font-family: inherit;
  font-size: 13px;
}
.msg-html :deep(.step-output-link-card) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.msg-html :deep(.step-output-link-preview) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 80px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg-elevated);
  overflow: hidden;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.msg-html :deep(.step-output-link-preview__img) {
  display: block;
  width: 120px;
  height: 80px;
  object-fit: cover;
  object-position: top left;
  background: #fff;
}
.msg-html :deep(.step-output-link-preview__status) {
  font-size: 10px;
  color: var(--ui-text-muted);
  text-align: center;
  line-height: 1.2;
  padding: 4px;
}

.reasoning-bubble {
  margin: 8px 0;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-elevated);
}
.reasoning-bubble__summary {
  cursor: pointer;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-muted);
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.reasoning-bubble__icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.75;
}
.reasoning-bubble__summary::-webkit-details-marker {
  display: none;
}
.reasoning-bubble__body {
  margin: 0;
  padding: 0 12px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  font-family: var(--font-mono, ui-monospace, monospace);
}
.thinking-strip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 2px;
  color: var(--color-primary-500, #6366f1);
}
.thinking-strip__icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.7;
}
@keyframes thinking-shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}
.thinking-strip__label {
  font-size: 13px;
  font-weight: 500;
  background: linear-gradient(
    90deg,
    var(--color-primary-500, #6366f1) 25%,
    color-mix(in srgb, var(--color-primary-300, #a5b4fc) 90%, white) 50%,
    var(--color-primary-500, #6366f1) 75%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: thinking-shimmer 1.6s linear infinite;
}
</style>
