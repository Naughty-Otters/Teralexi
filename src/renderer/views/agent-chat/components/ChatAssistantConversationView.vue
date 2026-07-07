<template>
  <div
    v-if="view && conversationSections.length > 0"
    class="conversation-view assistant-content-v2"
    :style="bubbleUiStyle"
  >
    <template
      v-for="(section, sectionIndex) in conversationSections"
      :key="`${section.id}-${sectionIndex}`"
    >
      <article
        class="conversation-bubble"
        :class="{
          [`conversation-bubble--${bubblePresentation(section).tone}`]: true,
          'conversation-bubble--attachments': isAttachmentsSection(section),
          'conversation-bubble--exportable':
            !isAttachmentsSection(section) && Boolean(section.bodyMarkdown?.trim()),
          'conversation-bubble--running': section.status === 'running',
          'conversation-bubble--done': section.status === 'done',
          'conversation-bubble--compact': shouldShowCompactBubble(section, sectionIndex),
        }"
        :tabindex="isAttachmentsSection(section) ? 0 : undefined"
        :role="isAttachmentsSection(section) ? 'button' : undefined"
        @click="onSectionActivate(section, $event)"
        @keydown.enter.prevent="onSectionActivate(section)"
        @keydown.space.prevent="onSectionActivate(section)"
      >
      <div class="conversation-bubble__top-bar">
        <header class="conversation-bubble__header">
          <button
            type="button"
            class="conversation-bubble__title"
            :aria-expanded="isBubbleExpanded(section, sectionIndex)"
            :title="titleButtonHint(section, sectionIndex)"
            @click.stop="onTitleClick(section, sectionIndex, $event)"
          >
            <UIcon
              :name="bubblePresentation(section).icon"
              class="conversation-bubble__title-icon"
              aria-hidden="true"
            />
            <span class="conversation-bubble__title-text">{{
              assistantBubbleSpeakerName()
            }}</span>
            <UIcon
              :name="
                isBubbleExpanded(section, sectionIndex)
                  ? 'i-lucide-chevron-down'
                  : 'i-lucide-chevron-right'
              "
              class="conversation-bubble__title-chevron"
              aria-hidden="true"
            />
          </button>
          <span
            v-if="bubblePresentation(section).badge"
            class="conversation-bubble__badge"
          >
            {{ bubblePresentation(section).badge }}
          </span>
        </header>
        <div
          v-if="section.bodyMarkdown?.trim() || section.status === 'running'"
          class="conversation-bubble__toolbar"
        >
          <span
            v-if="section.status === 'running'"
            class="conversation-bubble__status-slot"
            aria-live="polite"
          >
            <Transition name="conversation-bubble-phase" mode="out-in">
              <span
                :key="section.status"
                class="conversation-bubble__status conversation-bubble__status--running"
              >
                typing…
              </span>
            </Transition>
          </span>
          <ChatBubbleContentActionsLazy
            v-if="section.bodyMarkdown?.trim()"
            :markdown="section.bodyMarkdown"
            :section-title="section.title"
            :section-id="section.id"
            :message-id="props.message.id"
            @copied="onBubbleCopied"
            @copy-failed="onBubbleCopyFailed"
            @exported="onBubblePdfExported"
            @failed="onBubblePdfExportFailed"
          />
        </div>
      </div>
      <ChatConversationSnapshotPreview
        v-if="section.previewFileUrl && !isAttachmentsSection(section)"
        class="conversation-bubble__preview"
        :file-url="section.previewFileUrl"
      />
      <div
        v-if="section.bodyHtml"
        :ref="(el) => registerCompactBodyEl(sectionExpandKey(section, sectionIndex), el)"
        class="conversation-bubble__body msg-html"
        :class="`conversation-bubble__body--${bubblePresentation(section).tone}`"
        v-html="section.bodyHtml"
      />
      <div
        v-else-if="section.status === 'running' && !section.previewFileUrl"
        :ref="(el) => registerCompactBodyEl(sectionExpandKey(section, sectionIndex), el)"
        class="conversation-bubble__body conversation-bubble__body--empty"
        aria-live="polite"
      >
        <span class="conversation-bubble__placeholder">typing…</span>
      </div>
      <ul
        v-if="
          isAttachmentsSection(section) &&
          isBubbleExpanded(section, sectionIndex) &&
          attachmentItemsForSection(section).length
        "
        class="conversation-bubble__file-list"
      >
        <li
          v-for="(item, fileIndex) in attachmentItemsForSection(section)"
          :key="`${section.id}-${fileIndex}-${item.path}`"
        >
          <button
            type="button"
            class="conversation-bubble__file-item"
            :class="attachmentFileItemClass(item)"
            :disabled="!item.url"
            :title="attachmentFileItemTitle(item)"
            @click.stop="item.url && openPreview(item.url)"
          >
            <AttachmentFileTypeIcon
              :path="item.displayPath || item.label || item.path"
            />
            <span
              class="conversation-bubble__file-label"
              :class="
                attachmentFilePathClass(attachmentFilePath(item), {
                  deleted: item.action === 'delete',
                })
              "
            >{{ attachmentFilePath(item) }}</span>
            <span
              v-if="stepAttachmentHasDiffStats(item)"
              class="conversation-bubble__file-stats"
            >
              <span
                v-if="(item.additions ?? 0) > 0"
                class="conversation-bubble__file-stat conversation-bubble__file-stat--add"
              >
                +{{ item.additions }}
              </span>
              <span
                v-if="(item.deletions ?? 0) > 0"
                class="conversation-bubble__file-stat conversation-bubble__file-stat--del"
              >
                −{{ item.deletions }}
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p
        v-else-if="
          isAttachmentsSection(section) &&
          isBubbleExpanded(section, sectionIndex) &&
          !attachmentItemsForSection(section).length
        "
        class="conversation-bubble__file-hint"
      >
        Open preview in the panel →
      </p>
      </article>
      <template
        v-if="showExploringPanel"
        v-for="slot in toolLoopPanelSlotsAfter(sectionIndex)"
        :key="`tool-loop-${slot.key}`"
      >
        <div class="conversation-tool-loop-panel-wrap">
          <ChatToolLoopPanel
            :items="slot.items"
            :active="slot.live && toolLoopPanelActive(slot.items)"
            :list-display="chatUiToolCallListDisplay"
          />
        </div>
      </template>
      <div
        v-if="shouldShowLegacyToolResponsesAfter(sectionIndex)"
        class="conversation-tool-responses"
      >
        <ChatConversationToolResponseBubble
          v-for="toolBubble in visibleToolResponseBubbles"
          :key="toolBubble.key"
          :part="toolBubble.part"
          :viewer="toolBubble.viewer"
        />
      </div>
    </template>
    <div v-if="subAgentRuns.length" class="conversation-sub-agents">
      <ChatSubAgentBubble
        v-for="node in subAgentRuns"
        :key="node.runId"
        :node="node"
        :step-progress-parts="stepProgressParts"
        :markdown="markdown"
        :is-streaming="isStreaming"
        :message-id="props.message.id"
      />
    </div>
  </div>
  <div
    v-else-if="subAgentRuns.length"
    class="conversation-view assistant-content-v2 conversation-sub-agents--standalone"
    :style="bubbleUiStyle"
  >
      <ChatSubAgentBubble
        v-for="node in subAgentRuns"
        :key="node.runId"
        :node="node"
        :step-progress-parts="stepProgressParts"
        :markdown="markdown"
        :is-streaming="isStreaming"
        :message-id="props.message.id"
      />
  </div>
  <template v-else-if="showExploringPanel && standaloneToolLoopPanelSlots.length">
    <div
      v-for="slot in standaloneToolLoopPanelSlots"
      :key="`tool-loop-standalone-${slot.key}`"
      class="conversation-tool-loop-panel-wrap conversation-tool-loop-panel-wrap--standalone"
    >
      <ChatToolLoopPanel
        :items="slot.items"
        :active="slot.live && toolLoopPanelActive(slot.items)"
        :list-display="chatUiToolCallListDisplay"
      />
    </div>
  </template>
  <div
    v-else-if="visibleToolResponseBubbles.length"
    class="conversation-tool-responses conversation-tool-responses--standalone"
  >
    <ChatConversationToolResponseBubble
      v-for="toolBubble in visibleToolResponseBubbles"
      :key="toolBubble.key"
      :part="toolBubble.part"
      :viewer="toolBubble.viewer"
    />
  </div>
  <div
    v-else-if="fallbackHtml"
    class="conversation-bubble conversation-bubble--summary conversation-bubble--exportable conversation-fallback-bubble"
  >
    <div class="conversation-bubble__toolbar conversation-fallback-bubble__toolbar">
      <ChatBubbleContentActionsLazy
        :markdown="fallbackMarkdown"
        section-title="Response"
        section-id="fallback"
        :message-id="props.message.id"
        @copied="onBubbleCopied"
        @copy-failed="onBubbleCopyFailed"
        @exported="onBubblePdfExported"
        @failed="onBubblePdfExportFailed"
      />
    </div>
    <div class="msg-html structured-debug-fallback" v-html="fallbackHtml" />
  </div>
</template>

<script setup lang="ts">
import type { UIMessage } from '@teralexi-ai'
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import {
  dedupeStepAttachments,
  stepAttachmentHasDiffStats,
  stepAttachmentsToOutputLinks,
  type StepAttachment,
} from '@shared/agent/step-attachment'
import {
  assistantBubbleActivityLabel,
  assistantBubbleSpeakerName,
} from '@shared/agent/chat-persona'
import {
  attachmentFilePathClass,
  resolveFileTypePresentation,
} from '@shared/file-type/file-type-presentation'
import { chatUiBubbleCssVars } from '../chatUiSettings'
import { useAssistantStructuredMessageView } from '../useAssistantStructuredMessageView'
import ChatConversationSnapshotPreview from './ChatConversationSnapshotPreview.vue'
import ChatConversationToolResponseBubble from './ChatConversationToolResponseBubble.vue'
import AttachmentFileTypeIcon from './AttachmentFileTypeIcon.vue'
import ChatSubAgentBubble from './ChatSubAgentBubble.vue'
import { useBubbleActionToasts } from '../composables/useBubbleActionToasts'
import ChatBubbleContentActionsLazy from './ChatBubbleContentActionsLazy.vue'
import ChatToolLoopPanel from './ChatToolLoopPanel.vue'
import {
  type AssistantBubbleDescriptor,
  messageHasToolLoopAgent,
  toolGroupHasRunningItem,
} from './chat/assistantBubbleFramework'
import {
  conversationShouldUseToolLoopPanel,
  conversationToolBubblesToPanelItems,
  isToolLoopAnchorComplete,
  listToolLoopProgressAnchors,
  partitionToolsByToolLoopBoundaries,
  resolveConversationToolLoopPanelSlots,
  resolveConversationToolResponseBubbles,
  type ConversationToolLoopPanelSlot,
} from './chat/conversationToolResponseModel'
import { buildSubAgentRunTree } from './chat/subAgentRunModel'
import {
  conversationSectionExpandedByDefault,
  filterVisibleConversationBubbles,
  isPrimaryReplyConversationSection,
  isTextResponseConversationSection,
  messageFinalTextStarted,
} from '../conversationBubbleDisplay'
import {
  filterConversationToolResponseBubbles,
  filterToolLoopPanelSlots,
  shouldShowToolCallLists,
} from '@shared/agent/tool-call-list-display'
import { chatUiThinkingBubbleDisplay, chatUiToolCallListDisplay } from '../chatUiSettings'
import type { StructuredDebugSection } from '../structuredDebugViewModel'
import type { StepOutputLinkView } from '../stepOutputLinksRender'

function sectionExpandKey(
  section: StructuredDebugSection,
  sectionIndex: number,
): string {
  return `${section.id}-${sectionIndex}`
}

/** Conversation bubbles default expanded; user toggle always wins. */
function isBubbleExpanded(
  section: StructuredDebugSection,
  sectionIndex: number,
): boolean {
  const key = sectionExpandKey(section, sectionIndex)
  const explicit = bubbleViewExpanded.value[key]
  if (typeof explicit === 'boolean') return explicit

  const tone = bubblePresentation(section).tone
  if (isTextResponseConversationSection(section)) return true
  if (tone === 'summary' || tone === 'report') return true

  return conversationSectionExpandedByDefault(section, {
    isPrimaryReply: isPrimaryReplyConversationSection(
      conversationSections.value,
      sectionIndex,
    ),
  })
}

function shouldShowCompactBubble(
  section: StructuredDebugSection,
  sectionIndex: number,
): boolean {
  return !isBubbleExpanded(section, sectionIndex)
}

type ConversationBubbleTone =
  | 'generic'
  | 'thinking'
  | 'planning'
  | 'execution'
  | 'summary'
  | 'report'
  | 'artifact'
  | 'error'

type ConversationBubblePresentation = {
  tone: ConversationBubbleTone
  icon: string
  badge: string
}

const props = defineProps<{
  message: UIMessage
}>()

const {
  onBubbleCopied,
  onBubbleCopyFailed,
  onBubblePdfExported,
  onBubblePdfExportFailed,
} = useBubbleActionToasts()

const emit = defineEmits<{
  'open-preview': [url: string]
}>()

const {
  markdown,
  view,
  sections,
  fallbackHtml,
  assistantTextRaw,
  stepProgressParts,
  parentStepProgressParts,
  isStreaming,
} = useAssistantStructuredMessageView(() => props.message)

const fallbackMarkdown = computed(() => assistantTextRaw.value.trim())

const conversationSections = computed(() =>
  filterVisibleConversationBubbles(sections.value, {
    finalTextStarted: messageFinalTextStarted(props.message),
    toolCallListDisplay: chatUiToolCallListDisplay.value,
    thinkingBubbleDisplay: chatUiThinkingBubbleDisplay.value,
  }),
)

const bubbleUiStyle = computed(() => chatUiBubbleCssVars())

const subAgentRuns = computed(() => buildSubAgentRunTree(props.message))

const toolResponseBubbles = computed(() =>
  resolveConversationToolResponseBubbles(props.message),
)

const visibleToolResponseBubbles = computed(() =>
  filterConversationToolResponseBubbles(
    toolResponseBubbles.value,
    chatUiToolCallListDisplay.value,
  ),
)

const useToolLoopPanel = computed(
  () =>
    shouldShowToolCallLists(chatUiToolCallListDisplay.value) &&
    conversationShouldUseToolLoopPanel(props.message, sections.value),
)

const showExploringPanel = computed(
  () => useToolLoopPanel.value && !messageFinalTextStarted(props.message),
)

const frozenToolLoopPanelItemsByMessageId = ref(
  new Map<string, Map<string, AssistantBubbleDescriptor[]>>(),
)
const frozenToolLoopPanelsVersion = ref(0)

watchEffect(() => {
  const anchors = listToolLoopProgressAnchors(parentStepProgressParts.value)
  if (anchors.length === 0) return

  const partitioned = partitionToolsByToolLoopBoundaries(props.message, anchors)
  const messageId = props.message.id
  let frozen = frozenToolLoopPanelItemsByMessageId.value.get(messageId)
  if (!frozen) {
    frozen = new Map()
    frozenToolLoopPanelItemsByMessageId.value.set(messageId, frozen)
  }

  const lastIndex = anchors.length - 1
  let changed = false

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]!
    if (frozen.has(anchor.key)) continue
    const hasLaterAnchor = i < lastIndex
    if (
      !isToolLoopAnchorComplete(
        anchor,
        hasLaterAnchor,
        isStreaming.value,
      )
    ) {
      continue
    }
    const bubbles = partitioned.get(anchor.key) ?? []
    if (bubbles.length === 0 && i === lastIndex && isStreaming.value) continue
    frozen.set(anchor.key, conversationToolBubblesToPanelItems(bubbles))
    changed = true
  }

  if (changed) {
    frozenToolLoopPanelsVersion.value += 1
  }
})

const toolLoopPanelSlots = computed((): ConversationToolLoopPanelSlot[] => {
  if (!useToolLoopPanel.value) return []
  void frozenToolLoopPanelsVersion.value
  const frozen =
    frozenToolLoopPanelItemsByMessageId.value.get(props.message.id) ??
    new Map<string, AssistantBubbleDescriptor[]>()
  const slots = resolveConversationToolLoopPanelSlots({
    message: props.message,
    sections: sections.value,
    stepProgressParts: parentStepProgressParts.value,
    frozenItemsByAnchorKey: frozen,
    isStreaming: isStreaming.value,
  })
  return filterToolLoopPanelSlots(slots, chatUiToolCallListDisplay.value)
})

const standaloneToolLoopPanelSlots = computed(() =>
  toolLoopPanelSlots.value.filter((slot) => slot.sectionIndex < 0),
)

function toolLoopPanelSlotsAfter(
  sectionIndex: number,
): ConversationToolLoopPanelSlot[] {
  return toolLoopPanelSlots.value.filter(
    (slot) => slot.sectionIndex === sectionIndex,
  )
}

function toolLoopPanelActive(
  items: readonly AssistantBubbleDescriptor[],
): boolean {
  return toolGroupHasRunningItem({ items })
}

function shouldShowLegacyToolResponsesAfter(sectionIndex: number): boolean {
  if (
    !shouldShowToolCallLists(chatUiToolCallListDisplay.value) &&
    messageHasToolLoopAgent(props.message)
  ) {
    return false
  }
  if (useToolLoopPanel.value && toolLoopPanelSlots.value.length > 0) return false
  if (visibleToolResponseBubbles.value.length === 0) return false
  if (conversationSections.value.length === 0) return sectionIndex === 0
  return sectionIndex === conversationSections.value.length - 1
}

function isAttachmentsSection(section: StructuredDebugSection): boolean {
  return section.sectionKind === 'attachments'
}

function openPreview(url: string | undefined): void {
  const trimmed = url?.trim()
  if (!trimmed) return
  emit('open-preview', trimmed)
}

function attachmentItemsForSection(
  section: StructuredDebugSection,
): StepAttachment[] {
  return dedupeStepAttachments(section.attachments ?? [])
}

function attachmentFilePath(item: StepAttachment): string {
  return item.displayPath || item.label || item.path
}

function attachmentFileItemClass(item: StepAttachment): string[] {
  const { tone } = resolveFileTypePresentation(attachmentFilePath(item))
  const classes = [`attachment-file-item--${tone}`]
  if (item.action === 'delete') classes.push('attachment-file-item--deleted')
  return classes
}

function attachmentFileItemTitle(item: StepAttachment): string {
  const path = attachmentFilePath(item)
  const { kindLabel } = resolveFileTypePresentation(path)
  if (item.action === 'delete') return `Deleted ${kindLabel.toLowerCase()}: ${path}`
  if (!item.url) return `${kindLabel}: ${path}`
  return `Open ${kindLabel.toLowerCase()}: ${path}`
}

function attachmentLinksForSection(
  section: StructuredDebugSection,
): StepOutputLinkView[] {
  return stepAttachmentsToOutputLinks(section.attachments ?? [])
}

function primaryPreviewUrl(section: StructuredDebugSection): string | undefined {
  return (
    section.previewFileUrl?.trim() ||
    attachmentLinksForSection(section)[0]?.url?.trim()
  )
}

function onSectionActivate(
  section: StructuredDebugSection,
  event?: MouseEvent,
): void {
  if (!isAttachmentsSection(section)) return
  if (event?.target instanceof Element) {
    if (event.target.closest('.conversation-bubble__title')) return
    if (event.target.closest('.conversation-bubble__file-item')) return
    if (event.target.closest('.chat-bubble-action-btn')) return
  }
  openPreview(primaryPreviewUrl(section))
}

function titleButtonHint(
  section: StructuredDebugSection,
  sectionIndex: number,
): string {
  if (isAttachmentsSection(section)) {
    return isBubbleExpanded(section, sectionIndex)
      ? 'Collapse file list'
      : 'Expand file list · click bubble to preview'
  }
  return isBubbleExpanded(section, sectionIndex)
    ? 'Collapse message'
    : 'Expand message'
}

function onTitleClick(
  section: StructuredDebugSection,
  sectionIndex: number,
  event: MouseEvent,
): void {
  if (isAttachmentsSection(section)) {
    event.stopPropagation()
    toggleBubbleView(section, sectionIndex)
    openPreview(primaryPreviewUrl(section))
    return
  }
  toggleBubbleView(section, sectionIndex)
}

/** Per-bubble collapsed state; unset means expanded. */
const bubbleViewExpanded = ref<Record<string, boolean>>({})

watch(
  () => props.message.id,
  () => {
    bubbleViewExpanded.value = {}
    for (const [sectionId, el] of compactBodyEls) {
      const handler = compactBodyScrollHandlers.get(sectionId)
      if (handler) el.removeEventListener('scroll', handler)
    }
    compactBodyEls.clear()
    compactBodyStickToBottom.clear()
    compactBodyScrollHandlers.clear()
  },
)

const compactBodyEls = new Map<string, HTMLElement>()
/** When false, compact bubble body keeps user scroll position during streaming. */
const compactBodyStickToBottom = new Map<string, boolean>()
const compactBodyScrollHandlers = new Map<string, () => void>()

const COMPACT_BODY_STICK_THRESHOLD_PX = 40

function registerCompactBodyEl(sectionId: string, el: unknown): void {
  const prevEl = compactBodyEls.get(sectionId)
  const prevHandler = compactBodyScrollHandlers.get(sectionId)
  if (prevEl && prevHandler) {
    prevEl.removeEventListener('scroll', prevHandler)
    compactBodyScrollHandlers.delete(sectionId)
  }

  if (el instanceof HTMLElement) {
    const handler = () => onCompactBodyScroll(sectionId, el)
    compactBodyEls.set(sectionId, el)
    compactBodyScrollHandlers.set(sectionId, handler)
    el.addEventListener('scroll', handler, { passive: true })
    return
  }

  compactBodyEls.delete(sectionId)
  compactBodyStickToBottom.delete(sectionId)
}

function onCompactBodyScroll(sectionId: string, el: HTMLElement): void {
  compactBodyStickToBottom.set(
    sectionId,
    el.scrollHeight - el.scrollTop - el.clientHeight <
      COMPACT_BODY_STICK_THRESHOLD_PX,
  )
}

function scrollCompactBodiesToEnd(): void {
  for (const [sectionIndex, section] of conversationSections.value.entries()) {
    if (isBubbleExpanded(section, sectionIndex)) continue
    const key = sectionExpandKey(section, sectionIndex)
    const el = compactBodyEls.get(key)
    if (!el) continue
    const stick = compactBodyStickToBottom.get(key) ?? true
    if (!stick) continue
    el.scrollTop = el.scrollHeight
  }
}

watch(
  () =>
    conversationSections.value
      .map((s) => `${s.id}:${s.bodyHtml.length}:${s.status}`)
      .join('|'),
  () => {
    void nextTick(scrollCompactBodiesToEnd)
  },
  { flush: 'post' },
)

function toggleBubbleView(
  section: StructuredDebugSection,
  sectionIndex: number,
): void {
  const key = sectionExpandKey(section, sectionIndex)
  const next = !isBubbleExpanded(section, sectionIndex)
  bubbleViewExpanded.value = {
    ...bubbleViewExpanded.value,
    [key]: next,
  }
  if (next) {
    compactBodyStickToBottom.delete(key)
  } else {
    compactBodyStickToBottom.set(key, true)
    void nextTick(scrollCompactBodiesToEnd)
  }
}

function bubblePresentation(
  section: StructuredDebugSection,
): ConversationBubblePresentation {
  const status = section.status === 'running' ? 'running' : 'done'
  const badge = assistantBubbleActivityLabel(
    section.id,
    status,
    isAttachmentsSection(section) ? { attachments: true } : undefined,
  )

  if (isAttachmentsSection(section)) {
    return {
      tone: 'artifact',
      icon: 'i-lucide-paperclip',
      badge,
    }
  }

  switch (section.id) {
    case 'ThinkingStep':
    case 'thinking':
      return { tone: 'thinking', icon: 'i-lucide-circle-user', badge }
    case 'PlanningStep':
    case 'planning':
      return { tone: 'planning', icon: 'i-lucide-circle-user', badge }
    case 'SkillsToolExecutionStep':
    case 'toolLoop':
    case 'foreachItem':
      return { tone: 'execution', icon: 'i-lucide-circle-user', badge }
    case 'SummaryStep':
    case 'AnalysisStep':
    case 'summary':
      return { tone: 'summary', icon: 'i-lucide-circle-user', badge }
    case 'ReportStep':
    case 'report':
      return { tone: 'report', icon: 'i-lucide-circle-user', badge }
    case 'CreatePaperStep':
    case 'researchReport':
      return {
        tone: 'artifact',
        icon: 'i-lucide-circle-user',
        badge,
      }
    case 'resultSnapshot':
      return { tone: 'artifact', icon: 'i-lucide-image', badge }
    case 'finalResult':
      return { tone: 'summary', icon: 'i-lucide-circle-user', badge }
    case 'llmError':
    case 'agentError':
      return {
        tone: 'error',
        icon: 'i-lucide-alert-triangle',
        badge,
      }
    default: {
      const title = section.title?.trim().toLowerCase() ?? ''
      if (
        title === 'summary' ||
        title === 'analysis' ||
        title.includes('summary') ||
        title.includes('analysis')
      ) {
        return { tone: 'summary', icon: 'i-lucide-circle-user', badge }
      }
      return {
        tone: 'generic',
        icon: 'i-lucide-circle-user',
        badge,
      }
    }
  }
}
</script>

<style scoped>
@import '../step-disclosure.css';
@import '../step-output-links.css';
@import '../attachment-file-type.css';

.conversation-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  flex-shrink: 0;
  background: transparent;
}

.conversation-tool-responses {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding-left: 8px;
  border-left: 2px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
}

.conversation-tool-responses--standalone {
  margin-top: 4px;
}

.conversation-tool-loop-panel-wrap {
  width: 100%;
  min-width: 0;
  padding-left: 8px;
  border-left: 2px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
}

.conversation-tool-loop-panel-wrap--standalone {
  margin-top: 4px;
}

.conversation-sub-agents {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
}

.conversation-sub-agents--standalone {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.conversation-bubble {
  position: relative;
  flex-shrink: 0;
  align-self: flex-start;
  min-width: var(--chat-response-bubble-min-width, 50%);
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  box-shadow: none;
  transition:
    background-color 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease;
}

.conversation-bubble--thinking {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 32%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 4%,
    var(--ui-bg-elevated)
  );
}

.conversation-bubble--planning {
  border-color: color-mix(
    in srgb,
    var(--color-info-500, #0ea5e9) 32%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-info-500, #0ea5e9) 4%,
    var(--ui-bg-elevated)
  );
}

.conversation-bubble--execution {
  border-color: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 32%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-warning-500, #f59e0b) 4%,
    var(--ui-bg-elevated)
  );
}

.conversation-bubble--summary,
.conversation-bubble--report {
  border-color: color-mix(
    in srgb,
    var(--color-success-500, #22c55e) 28%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-success-500, #22c55e) 4%,
    var(--ui-bg-elevated)
  );
}

.conversation-bubble--artifact {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 26%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 4%,
    var(--ui-bg-elevated)
  );
}

.conversation-bubble--error {
  border-color: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 40%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-error-500, #ef4444) 8%,
    var(--ui-bg-elevated)
  );
}

.conversation-bubble--error .conversation-bubble__body {
  color: var(--color-error-500, #ef4444);
}

.conversation-bubble--attachments {
  cursor: pointer;
}

.conversation-bubble--attachments:hover {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 42%,
    var(--ui-border)
  );
}

.conversation-bubble--attachments:focus-visible {
  outline: 2px solid var(--color-primary-500, #6366f1);
  outline-offset: 2px;
}

.conversation-bubble__file-list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conversation-bubble__file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  font: inherit;
  font-size: 13px;
  color: var(--ui-text);
  text-align: left;
  cursor: pointer;
  padding-left: 6px;
}

.conversation-bubble__file-item:hover {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 35%,
    var(--ui-border)
  );
  background: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 6%,
    var(--ui-bg)
  );
}

.conversation-bubble__file-icon,
.conversation-bubble__file-item :deep(.attachment-file-type-icon) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.conversation-bubble__file-label {
  font-family: var(--app-font-family);
  font-size: 12px;
}

.conversation-bubble__file-stats {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
  font-family: var(--app-font-family);
  font-size: 11px;
  font-weight: 600;
}

.conversation-bubble__file-stat--add {
  color: var(--color-success-600, #16a34a);
}

.conversation-bubble__file-stat--del {
  color: var(--color-error-600, #dc2626);
}

.conversation-bubble__file-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.conversation-bubble--running {
  border-color: color-mix(
    in srgb,
    var(--color-primary-500, #6366f1) 35%,
    var(--ui-border)
  );
}

.conversation-bubble__top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.conversation-bubble__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  margin-bottom: 0;
}

.conversation-bubble__toolbar {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.conversation-fallback-bubble__toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.conversation-fallback-bubble {
  position: relative;
  min-width: var(--chat-response-bubble-min-width, 50%);
  padding: 10px 12px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}

.conversation-fallback-bubble .structured-debug-fallback {
  padding-right: 96px;
}

.conversation-bubble__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
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
  transition: color 0.22s ease;
}

.conversation-bubble__title:hover {
  color: var(--ui-text);
}

.conversation-bubble__title:focus-visible {
  outline: 2px solid var(--color-primary-500, #6366f1);
  outline-offset: 2px;
  border-radius: 4px;
}

.conversation-bubble__title-text {
  flex: 0 1 auto;
  min-width: 0;
}

.conversation-bubble__title-chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.75;
}

.conversation-bubble__title-icon {
  width: 13px;
  height: 13px;
  color: currentColor;
  transition:
    color 0.22s ease,
    opacity 0.18s ease;
}

.conversation-bubble--running .conversation-bubble__title {
  color: var(--color-primary-500, #6366f1);
}

.conversation-bubble__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  font-size: 11px;
  font-weight: 600;
}

.conversation-bubble__status-slot {
  display: inline-flex;
  align-items: center;
  min-width: 54px;
}

.conversation-bubble__badge {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition:
    color 0.22s ease,
    background-color 0.22s ease,
    border-color 0.22s ease;
}

.conversation-bubble__status--running {
  color: var(--color-primary-500, #6366f1);
}

.conversation-bubble-phase-enter-active,
.conversation-bubble-phase-leave-active {
  transition: opacity 0.18s ease;
}

.conversation-bubble-phase-enter-from,
.conversation-bubble-phase-leave-to {
  opacity: 0;
}

.conversation-bubble__body {
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text);
}

/* Compact: fixed-height viewport; JS keeps scroll pinned to latest lines. */
.conversation-bubble--compact .conversation-bubble__body:not(.conversation-bubble__body--empty) {
  max-height: calc(1em * var(--chat-bubble-compact-lines, 4));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    #000 18%,
    #000 100%
  );
  mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 100%);
}

.conversation-bubble--compact .conversation-bubble__body:not(.conversation-bubble__body--empty)::-webkit-scrollbar {
  display: none;
}

.conversation-bubble--compact .conversation-bubble__body--empty {
  max-height: calc(1em * 2);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.conversation-bubble--compact .conversation-bubble__outputs {
  max-height: calc(1em * 2);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 65%,
    transparent 100%
  );
  mask-image: linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%);
}

.conversation-bubble--compact .conversation-bubble__top-bar {
  margin-bottom: 4px;
}

.conversation-bubble__body--execution :deep(pre),
.conversation-bubble__body--report :deep(pre),
.conversation-bubble__body--summary :deep(pre) {
  font-family: var(--app-font-family);
}

.conversation-bubble__body--artifact :deep(p:first-child) {
  margin-top: 0;
}

.conversation-bubble__preview {
  margin-top: 4px;
  margin-bottom: 2px;
}

.conversation-bubble__body--empty {
  min-height: 1.25em;
}

.conversation-bubble__placeholder {
  font-size: 13px;
  color: var(--ui-text-muted);
  font-style: italic;
}

.conversation-bubble__outputs {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--ui-border);
}

.conversation-bubble__body :deep(p) {
  margin: 0.35em 0;
}

.conversation-bubble__body :deep(.assistant-content-v2),
.conversation-bubble__body :deep(.assistant-content-block) {
  background: transparent;
  padding: 0;
}

.conversation-bubble__body :deep(.assistant-content-v2) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conversation-bubble__body :deep(.step-disclosure) {
  margin: 0;
}

.conversation-bubble__body :deep(.step-disclosure__content) {
  margin-top: 8px;
  padding: 0;
  background: transparent;
}
</style>
