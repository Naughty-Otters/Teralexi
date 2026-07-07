<template>
  <div class="chat-panel" @click.capture="onChatPanelClick">
    <ChatPanelHeader
      :active-agent-name="activeAgentName"
      :active-agent-model="activeAgentModel"
      :active-agent-color="activeAgentColor"
      :is-busy="isBusy"
      :context-usage="contextWindowUsage"
    />

    <div
      ref="chatBodyEl"
      class="chat-body"
      :class="{
        'chat-body--resizing':
          reportPanelResizing || workspaceSplitPanelResizing,
      }"
    >
      <WorkspacePanel
        v-if="showWorkspaceSplitPanel"
        layout="split"
        :style="{ width: `${workspaceSplitPanelWidthPx}px` }"
        @close="closeWorkspaceSplitPanel"
      />

      <PanelResizeHandle
        v-if="showWorkspaceSplitPanel"
        placement="after-start"
        :active="workspaceSplitPanelResizing"
        aria-label="Resize workspace panel"
        @pointerdown="onWorkspaceSplitPanelResizePointerDown"
        @keyboard-resize="onWorkspaceSplitPanelKeyboardResize"
      />

      <section class="chat-main">
        <div class="chat-scroll-area">
          <div
            v-if="showConversationLoading"
            class="chat-conversation-loading"
            role="status"
            aria-live="polite"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="chat-conversation-loading__icon"
              aria-hidden="true"
            />
            <span>{{ t.common.loading }}</span>
          </div>
          <div
            ref="messagesEl"
            class="chat-scroll"
            @scroll.passive="onMessagesScroll"
            @wheel.passive="onMessagesWheel"
          >
            <div ref="messagesContentEl" class="chat-scroll__content">
            <AgentGuidePanel
              v-if="showAgentGuide"
              :agents="agentStore.chatSelectableAgents"
              :selected-agent-id="agentStore.selectedAgentId"
              @select-agent="onSelectAgent"
            />
            <div
              v-if="hasHiddenAbove || isLoadingOlderMessages"
              class="chat-scroll-edge chat-scroll-edge--top"
              aria-hidden="true"
            >
              <span
                v-if="isLoadingOlderMessages"
                class="chat-scroll-edge__label"
              >
                Loading older messages…
              </span>
            </div>
            <div
              v-for="msg in visibleMessages"
              :key="msg.id"
              :class="[
                'msg-row',
                msg.role === 'user' ? 'msg-row--user' : 'msg-row--assistant',
              ]"
            >
              <ChatUserMessage v-if="msg.role === 'user'" :message="msg" />
              <ChatAssistantMessageParts
                v-else
                :message="msg"
                :render-text-part-html="assistantTextPartHtml"
                :chat-ready="!!chatInst"
                :show-thinking-indicator="
                  thinkingAssistantMessageId != null &&
                  msg.id === thinkingAssistantMessageId
                "
                :show-catching-up="
                  thinkingAssistantMessageId != null &&
                  msg.id === thinkingAssistantMessageId &&
                  isCatchingUp
                "
                @collect-form-submit="onCollectFormSubmit"
                @tool-approval="onToolApproval"
                @open-preview="openSandboxPreview"
              />
            </div>

            <div
              v-if="hasHiddenBelow"
              class="chat-scroll-edge chat-scroll-edge--bottom"
              aria-hidden="true"
            >
              <span class="chat-scroll-edge__label">
                Newer messages hidden — scroll down
              </span>
            </div>

            <div
              v-if="queuedMessageCount > 0"
              class="message-queue"
              role="region"
              aria-label="Queued messages"
            >
              <p class="message-queue__title">
                Queued — sent when the agent is ready
              </p>
              <ul class="message-queue__list">
                <li
                  v-for="item in messageQueue"
                  :key="item.id"
                  class="message-queue__item"
                >
                  <span class="message-queue__text">{{ item.text }}</span>
                  <button
                    type="button"
                    class="message-queue__remove"
                    aria-label="Remove from queue"
                    title="Remove from queue"
                    @click="removeQueuedMessage(item.id)"
                  >
                    <UIcon
                      name="i-lucide-x"
                      class="message-queue__remove-icon"
                    />
                  </button>
                </li>
              </ul>
            </div>
            </div>
          </div>
        </div>

        <ChatConversationWorkspaceAttachments
          v-if="
            workspaceStore.isWorkspaceActive &&
            conversationWorkspaceAttachments.length > 0
          "
          :attachments="conversationWorkspaceAttachments"
          @open-preview="openSandboxPreview"
        />

        <ChatComposer
          v-model="draft"
          :send-disabled="!canSend"
          :selected-agent-id="agentStore.selectedAgentId"
          :agent-options="composerAgentOptions"
          :chat-agents="composerChatAgents"
          :conversation-id="agentStore.currentConversationId"
          :workspace-disabled="isBusy"
          :workspace-hint="workspaceComposerHint"
          :google-workspace-hint="googleWorkspaceComposerHint"
          :skill-setup="composerSkillSetup"
          :show-coding-mode-bar="selectedAgentIsCoding"
          :coding-agent="selectedAgentIsCoding"
          :coding-mode="codingMode"
          :plan-display-status="planDisplayStatus"
          :background-tasks="backgroundTasks"
          :sub-agent-slash-enabled="subAgentSlashEnabled"
          :staged-attachments="stagedAttachments"
          :can-add-attachments="canAddAttachments"
          @select-agent="onSelectAgent"
          @update:coding-mode="onCodingModeChange"
          @cancel-background-task="onCancelBackgroundTask"
          @pick-attachments="pickAttachments"
          @remove-attachment="removeStaged"
          @add-attachment-paths="addSourcePaths"
          @submit="onSubmit"
        />
        <p v-if="attachmentError" class="chat-attachment-error" role="alert">
          {{ attachmentError }}
        </p>
      </section>

      <PanelResizeHandle
        v-if="showReportPanel"
        placement="before-end"
        :active="reportPanelResizing"
        aria-label="Resize sandbox preview"
        @pointerdown="onReportPanelResizePointerDown"
        @keyboard-resize="onReportPanelKeyboardResize"
      />

      <ReportPanel
        v-if="showReportPanel"
        :style="{ width: `${reportPanelWidthPx}px` }"
        :link-tabs="currentPreviewLinkTabs"
        :active-link-tab-id="currentActivePreviewLinkTabId"
        :preview-source="currentPreviewPanelSource"
        :sandbox-runs="agentStore.sandboxRunsForCurrentConversation"
        :selected-run-id="agentStore.selectedSandboxRunIdForCurrentConversation"
        @update:selected-run-id="agentStore.setSelectedSandboxRunId"
        @update:active-link-tab-id="onUpdateActivePreviewLinkTabId"
        @update:preview-source="onUpdatePreviewPanelSource"
        @close-link-tab="onClosePreviewLinkTab"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from 'vue'
import { resolveDiagramBlocksInHtml } from '@shared/markdown/create-markdown-it'
import './chat/markdown-preview.css'
import { Chat } from '@teralexi-ai/vue'
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from '@teralexi-ai'

import {
  useAgentStore,
  type Conversation,
  type Message as StoreMessage,
} from '@store/agent'
import { useWorkspaceStore } from '@store/workspace'
import { useWorkspaceNavigationStore } from '@store/workspace-navigation'
import { agentIsCodingAgent } from '@shared/agent/coding-agent'
import { formatAgentGroupDisplayName } from '@shared/agent/skill-groups'
import {
  agentIsGoogleWorkspaceAgent,
  googleWorkspaceComposerHint as buildGoogleWorkspaceComposerHint,
} from '@shared/agent/google-workspace-agent'
import {
  defaultPlanModeView,
  resolvePlanModeDisplayStatus,
  type PlanModeView,
} from '@shared/agent/plan-mode-phase'
import { agentRequiresWorkspace } from '@shared/agent/workspace-required-skills'
import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'
import { collectConversationWorkspaceAttachments } from '@shared/agent/conversation-workspace-attachments'
import { useGoogleWorkspaceAccount } from '@renderer/composables/useGoogleWorkspaceAccount'
import { useSkillSystemProperties } from '@renderer/composables/useSkillSystemProperties'
import { useI18n } from '@renderer/composables/useI18n'
import { DEFAULT_USER_ID } from '@store/agent/config'
import { setTitleBarChatControls } from '@renderer/composables/useTitleBarChatControls'
import { useChatAttachments } from '@renderer/composables/useChatAttachments'
import type { ChatAttachmentMeta } from '@shared/chat/attachments'
import { CHAT_MESSAGE_ATTACHMENTS_KEY } from './chatAttachmentContext'

import {
  createRendererChatGenerateId,
  IpcAgentChatTransport,
} from '../IpcAgentChatTransport'
import {
  clearConversationChatCache,
  clearConversationSession,
  conversationHitlBlocksQueue,
  getConversationChat,
  setConversationHitlBlocksQueue,
  getConversationQueue,
  getConversationSnapshot,
  setConversationChat,
  stashConversationChat,
  syncConversationSnapshot,
  type QueuedUserMessage,
} from '../conversation-chat-session'
import {
  UI_CHAT_CONVERSATION_MODE_ONLY,
  resolveUiChatBoxDisplayMode,
  usesStructuredAssistantRendering,
} from '../chatBoxDisplayMode'
import { computeContextWindowUsage } from '@shared/agent/context-window-usage'
import { chatUiContextWindowMessages } from '../chatUiSettings'
import { useChatMessageScrollWindow } from '../useChatMessageScrollWindow'
import { useStreamingTextBuffer } from '../useStreamingTextBuffer'
import { chatUiPerfMark, chatUiPerfMarkEnd } from '../perf/chatUiPerf'
import {
  flushAllUiForConversation,
  scheduleUiFlush,
  setVisibleConversationForUiFlush,
  conversationIsCatchingUp,
} from '../perf/scheduleUiFlush'
import { registerConversationStoreUiSync } from '../conversationStoreUiSync'
import { createAssistantTextPartHtmlRenderer } from './chat/chatAssistantRender'
import {
  incrementalSyncChatMessages,
  mergeLiveChatMessagesWithStore,
  normalizeChatMessagesForDisplay,
} from './chat/chatMessageNormalize'
import { chatMessagesHavePendingHitl } from './chat/chatHitlHelpers'
import {
  isExitPlanModeToolPart,
  toolPartDisplayName,
} from './chat/chatToolPartHelpers'
import { lastAssistantMessageIsCompleteWithCollectFormResponses } from './chat/chatSendAutomaticallyWhen'

import { useHorizontalPanelResize } from '@renderer/composables/useHorizontalPanelResize'
import {
  LAYOUT_PREF_KEYS,
  useLayoutPreference,
} from '@renderer/lib/layout-preferences'
import { useLazyStandardMarkdown } from '@renderer/composables/useLazyStandardMarkdown'
import PanelResizeHandle from '@renderer/components/PanelResizeHandle.vue'
import { handleChatPanelLinkClick } from '../sandboxPreview'
import { bindSandboxPreviewRequest } from '../sandboxPreviewBridge'
import {
  closePreviewLinkTab,
  openPreviewLinkTab,
  type PreviewLinkTab,
} from '../report-preview-tabs'
import type { ReportPanelPreviewSource } from './ReportPanel.vue'
import ChatPanelHeader from './ChatPanelHeader.vue'
import AgentGuidePanel from './AgentGuidePanel.vue'
import ChatUserMessage from './ChatUserMessage.vue'
import ChatAssistantMessageParts from './ChatAssistantMessageParts.vue'
import ChatComposer from './ChatComposer.vue'
import ChatConversationWorkspaceAttachments from './ChatConversationWorkspaceAttachments.vue'
import { formatSlashHelp } from './composer-slash-commands'
import { openComposerAgentPicker } from '@renderer/composables/useComposerAgentPicker'
import {
  describeAgentSlashStatus,
  formatAgentSwitchHelp,
  isAgentSlashCommand,
  parseAgentSlashCommand,
  resolveAgentIdForAgentSwitch,
  type AgentSlashAction,
} from '@shared/agent/agent-switch-command'
import {
  isSkillSwitchCommand,
  parseSkillSwitchCommand,
  resolveAgentIdForSkillSwitch,
} from '@shared/agent/skill-switch-command'
import {
  describeWorkspaceSlashStatus,
  formatWorkspaceSlashHelp,
  isWorkspaceSlashCommand,
  parseWorkspaceSlashCommand,
  type WorkspaceSlashAction,
} from '@shared/agent/workspace-slash-command'
import type { CodingMode } from '@shared/agent/coding-mode'
import {
  codingModeLabel,
  DEFAULT_CODING_MODE,
  parseCodingMode,
} from '@shared/agent/coding-mode'
import type { BackgroundTaskView } from './BackgroundTaskPanel.vue'
import {
  resolveDelegatableSubAgentTargets,
} from '@shared/agent/sub-agent-targets'
import {
  isSubAgentSlashCommand,
  parseSubAgentSlashCommand,
} from '@shared/agent/sub-agent-slash-command'
import { resolveAllowSubAgents } from '@shared/agent/sub-agent-settings'

const ReportPanel = defineAsyncComponent(() => import('./ReportPanel.vue'))
const WorkspacePanel = defineAsyncComponent(() => import('./WorkspacePanel.vue'))

const props = defineProps<{ sidebarCollapsed: boolean }>()
const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const agentStore = useAgentStore()
const showConversationLoading = computed(
  () => agentStore.isLoadingInitialConversations,
)
const workspaceStore = useWorkspaceStore()
const workspaceNavStore = useWorkspaceNavigationStore()
const { t } = useI18n()
const selectedAgentRef = computed(() => agentStore.selectedAgent)
const skillSystemProperties = useSkillSystemProperties(selectedAgentRef)
const {
  isSignedIn: googleWorkspaceSignedIn,
  hasWorkspaceAccess: googleWorkspaceHasAccess,
  refresh: refreshGoogleWorkspaceAccount,
} = useGoogleWorkspaceAccount()
const toast = useToast()

const COMPACT_CMD_RE = /^\/compact(?:\s+([\s\S]*))?$/i
const MODE_CMD_RE = /^\/(yolo|auto)\b/i
const EXPLORE_CMD_RE = /^\/explore(?:\s+(\S+))?\b/i
/** @deprecated Use /explore — kept for backward compatibility. */
const PLAN_CMD_ALIAS_RE = /^\/plan(?:\s+(\S+))?\b/i
const HELP_CMD_RE = /^\/help\b/i
const MCP_CMD_RE = /^\/mcp(?:\s+([\s\S]*))?$/i
const INSTALL_SKILL_CMD_RE = /^\/skill:install\s+(\S+)/i
const standardMarkdown = useLazyStandardMarkdown()

const codingMode = ref<CodingMode>(DEFAULT_CODING_MODE)
const planModeView = ref<PlanModeView>(defaultPlanModeView())
const backgroundTasks = ref<BackgroundTaskView[]>([])
let backgroundTaskPollTimer: ReturnType<typeof setInterval> | null = null

const draft = ref('')
const messageAttachmentsById = ref<Record<string, ChatAttachmentMeta[]>>({})
const {
  staged: stagedAttachments,
  attachmentSourcePaths,
  pickAttachments,
  addSourcePaths,
  removeStaged,
  clearStaging,
  canAddMore: canAddAttachments,
  error: attachmentError,
} = useChatAttachments({
  conversationId: computed(() => agentStore.currentConversationId),
})

provide(CHAT_MESSAGE_ATTACHMENTS_KEY, messageAttachmentsById)
provide(
  'chatConversationId',
  computed(() => agentStore.currentConversationId),
)

async function loadConversationAttachments(conversationId: string | null | undefined) {
  const cid = conversationId?.trim()
  if (!cid) {
    messageAttachmentsById.value = {}
    return
  }
  const ch = window.ipcRendererChannel?.GetConversationAttachments
  if (!ch) return
  const result = await ch.invoke({ conversationId: cid })
  if (!result.ok) return
  const grouped: Record<string, ChatAttachmentMeta[]> = {}
  for (const item of result.attachments ?? []) {
    const messageId = item.messageId?.trim()
    if (!messageId) continue
    grouped[messageId] = [...(grouped[messageId] ?? []), item]
  }
  messageAttachmentsById.value = grouped
}

function sendTextForAttachments(sourcePaths: readonly string[]): string {
  if (sourcePaths.length === 0) return ''
  return `Attached ${sourcePaths.length} file${sourcePaths.length === 1 ? '' : 's'}`
}

const showReportPanel = useLayoutPreference(
  LAYOUT_PREF_KEYS.reportPanelOpen,
  false,
)
const showWorkspaceSplitPanel = useLayoutPreference(
  LAYOUT_PREF_KEYS.workspaceSplitPanelOpen,
  false,
)
const previewLinkTabsByConversation = ref<Record<string, PreviewLinkTab[]>>({})
const activePreviewLinkTabIdByConversation = ref<Record<string, string | null>>(
  {},
)
const previewPanelSourceByConversation = ref<
  Record<string, ReportPanelPreviewSource>
>({})
const messagesEl = ref<HTMLElement | null>(null)
const messagesContentEl = ref<HTMLElement | null>(null)
const chatBodyEl = ref<HTMLElement | null>(null)
const chatInst = shallowRef<InstanceType<typeof Chat> | null>(null)

const reportPanelResizeEnabled = computed(() => showReportPanel.value)

const {
  sizePx: reportPanelWidthPx,
  isResizing: reportPanelResizing,
  onResizePointerDown: onReportPanelResizePointerDown,
  setSize: setReportPanelWidth,
} = useHorizontalPanelResize({
  containerRef: chatBodyEl,
  panelSide: 'end',
  defaultSize: 480,
  minSize: 280,
  maxSize: { fraction: 0.78 },
  storageKey: 'teralexi.agent.reportPanelWidth',
  enabled: reportPanelResizeEnabled,
})

const workspaceSplitPanelResizeEnabled = computed(
  () => showWorkspaceSplitPanel.value,
)

const {
  sizePx: workspaceSplitPanelWidthPx,
  isResizing: workspaceSplitPanelResizing,
  onResizePointerDown: onWorkspaceSplitPanelResizePointerDown,
  setSize: setWorkspaceSplitPanelWidth,
} = useHorizontalPanelResize({
  containerRef: chatBodyEl,
  panelSide: 'start',
  defaultSize: 420,
  minSize: 320,
  maxSize: { fraction: 0.62 },
  storageKey: 'teralexi.agent.workspaceSplitPanelWidth',
  enabled: workspaceSplitPanelResizeEnabled,
})

function onReportPanelKeyboardResize(delta: number) {
  setReportPanelWidth(reportPanelWidthPx.value + delta)
}

function onWorkspaceSplitPanelKeyboardResize(delta: number) {
  setWorkspaceSplitPanelWidth(workspaceSplitPanelWidthPx.value + delta)
}

const currentPreviewLinkTabs = computed(() => {
  const cid = agentStore.currentConversationId
  if (!cid) return []
  return previewLinkTabsByConversation.value[cid] ?? []
})

const currentActivePreviewLinkTabId = computed(() => {
  const cid = agentStore.currentConversationId
  if (!cid) return null
  return activePreviewLinkTabIdByConversation.value[cid] ?? null
})

const currentPreviewPanelSource = computed((): ReportPanelPreviewSource => {
  const cid = agentStore.currentConversationId
  if (!cid) return 'sandbox-run'
  return previewPanelSourceByConversation.value[cid] ?? 'sandbox-run'
})

function setConversationPreviewTabs(
  conversationId: string,
  tabs: PreviewLinkTab[],
  activeTabId: string | null,
) {
  previewLinkTabsByConversation.value = {
    ...previewLinkTabsByConversation.value,
    [conversationId]: tabs,
  }
  activePreviewLinkTabIdByConversation.value = {
    ...activePreviewLinkTabIdByConversation.value,
    [conversationId]: activeTabId,
  }
}

function openSandboxPreview(url: string) {
  const cid = agentStore.currentConversationId?.trim()
  if (!cid) return
  const prevTabs = previewLinkTabsByConversation.value[cid] ?? []
  const { tabs, activeTabId } = openPreviewLinkTab(prevTabs, url)
  setConversationPreviewTabs(cid, tabs, activeTabId)
  previewPanelSourceByConversation.value = {
    ...previewPanelSourceByConversation.value,
    [cid]: 'link',
  }
  showReportPanel.value = true
}

function onUpdateActivePreviewLinkTabId(tabId: string | null) {
  const cid = agentStore.currentConversationId?.trim()
  if (!cid) return
  activePreviewLinkTabIdByConversation.value = {
    ...activePreviewLinkTabIdByConversation.value,
    [cid]: tabId,
  }
}

function onUpdatePreviewPanelSource(source: ReportPanelPreviewSource) {
  const cid = agentStore.currentConversationId?.trim()
  if (!cid) return
  previewPanelSourceByConversation.value = {
    ...previewPanelSourceByConversation.value,
    [cid]: source,
  }
}

function onClosePreviewLinkTab(tabId: string) {
  const cid = agentStore.currentConversationId?.trim()
  if (!cid) return
  const prevTabs = previewLinkTabsByConversation.value[cid] ?? []
  const activeId = activePreviewLinkTabIdByConversation.value[cid] ?? null
  const { tabs, activeTabId } = closePreviewLinkTab(prevTabs, activeId, tabId)
  setConversationPreviewTabs(cid, tabs, activeTabId)
  if (tabs.length === 0) {
    previewPanelSourceByConversation.value = {
      ...previewPanelSourceByConversation.value,
      [cid]: 'sandbox-run',
    }
  }
}

function onChatPanelClick(event: MouseEvent) {
  handleChatPanelLinkClick(event, openSandboxPreview)
}

function onChatBodySandboxPreviewClick(event: MouseEvent) {
  handleChatPanelLinkClick(event, openSandboxPreview)
}

const messageQueue = ref<QueuedUserMessage[]>([])
const queuedMessageCount = computed(() => messageQueue.value?.length ?? 0)

/** Last conversation rendered in this panel (may differ from store during async select). */
const lastViewedConversationId = ref<string | null>(null)

const chatGenerateId = createRendererChatGenerateId()

const streamingTextBuffer = useStreamingTextBuffer()

const assistantTextPartHtmlRenderer = shallowRef<
  ((msg: UIMessage, part: unknown) => string) | null
>(null)

watch(
  standardMarkdown,
  (markdown) => {
    if (!markdown) return
    assistantTextPartHtmlRenderer.value = createAssistantTextPartHtmlRenderer({
      markdown,
      getStructuredDebug: () =>
        usesStructuredAssistantRendering(resolveUiChatBoxDisplayMode()),
      getStreamingText: UI_CHAT_CONVERSATION_MODE_ONLY
        ? undefined
        : (msg, part) => {
            const partId = (part as { id?: string }).id ?? 'text-0'
            const override = streamingTextBuffer.textForMessage(
              msg,
              partId,
              part.text ?? '',
            )
            if (override !== (part.text ?? '')) return override
            return undefined
          },
    })
  },
  { immediate: true },
)

function assistantTextPartHtml(msg: UIMessage, part: unknown): string {
  return assistantTextPartHtmlRenderer.value?.(msg, part) ?? ''
}

const isCatchingUp = computed(() => {
  const cid = agentStore.currentConversationId
  if (!cid) return false
  return conversationIsCatchingUp(cid).value
})

function scheduleSnapshot(conversationId: string, immediate = false): void {
  scheduleUiFlush('snapshot', () => syncConversationSnapshot(conversationId), {
    conversationId,
    priority: immediate ? 'immediate' : 'normal',
    force: immediate,
  })
}

function shouldPreserveReactiveMessagesWhenChatEmpty(): boolean {
  if (!chatInst.value || reactiveMessages.value.length === 0) return false
  const cid = agentStore.currentConversationId
  if (!cid) return false
  if ((agentStore.conversations[cid] ?? []).length > 0) return true
  return Boolean(getConversationChat(cid)?.messages?.length)
}

function syncReactiveMessagesFromChat(
  raw: UIMessage[] | undefined,
  opts?: { full?: boolean },
): void {
  if (!raw || raw.length === 0) {
    if (shouldPreserveReactiveMessagesWhenChatEmpty()) return
    reactiveMessages.value = []
    streamingTextBuffer.clear()
    return
  }

  chatUiPerfMark('normalize')
  reactiveMessages.value =
    opts?.full || reactiveMessages.value.length === 0
      ? normalizeChatMessagesForDisplay(raw)
      : incrementalSyncChatMessages(raw, reactiveMessages.value)
  chatUiPerfMarkEnd('normalize')

  const tail = reactiveMessages.value[reactiveMessages.value.length - 1]
  if (UI_CHAT_CONVERSATION_MODE_ONLY) {
    streamingTextBuffer.clear()
  } else if (tail?.role === 'assistant') {
    streamingTextBuffer.syncFromMessage(tail)
  } else {
    streamingTextBuffer.clear()
  }
}

function scheduleScrollToBottom(behavior: ScrollBehavior = 'auto'): void {
  scheduleUiFlush(
    'scroll',
    () => {
      void scrollToBottomIfStuck(behavior)
    },
    {
      conversationId: agentStore.currentConversationId ?? undefined,
      priority: 'normal',
    },
  )
}

const transport = new IpcAgentChatTransport({
  getRunContext: () => {
    const agentId = agentStore.selectedAgentId
    const conversationId = agentStore.currentConversationId ?? undefined
    if (!agentId || !conversationId) return null
    return {
      conversationId,
      agentId,
      userId: DEFAULT_USER_ID,
    }
  },
  onStreamLifecycle(conversationId, phase) {
    agentStore.markUiChatInFlight(conversationId, phase === 'start')
    if (phase === 'end') {
      flushAllUiForConversation(conversationId)
      scheduleSnapshot(conversationId, true)
      streamingTextBuffer.flushNow()
      scheduleUiFlush(
        'messages-sync',
        () => {
          const inst = chatInst.value as unknown as {
            state?: { messagesRef?: { value: UIMessage[] } }
          }
          syncReactiveMessagesFromChat(inst?.state?.messagesRef?.value, {
            full: true,
          })
        },
        { conversationId, priority: 'immediate', force: true },
      )
      void refreshPlanModeState(conversationId)
    }
  },
  onStreamUiChunk(conversationId, meta) {
    scheduleSnapshot(conversationId, meta?.immediate)
    scheduleUiFlush(
      'messages-sync',
      () => {
        const inst = chatInst.value as unknown as {
          state?: { messagesRef?: { value: UIMessage[] } }
        }
        syncReactiveMessagesFromChat(inst?.state?.messagesRef?.value)
      },
      {
        conversationId,
        priority: meta?.immediate ? 'immediate' : 'normal',
        force: meta?.immediate,
      },
    )
  },
  onHitlBlocksQueue(conversationId, blocked) {
    setConversationHitlBlocksQueue(conversationId, blocked)
    void refreshPlanModeState(conversationId)
    if (!blocked && chatInst.value?.id === conversationId) {
      void nextTick(() => dequeueAndSendNext())
    }
  },
  persistUserMessage: async ({ id, conversationId, agentId, content }) => {
    /** User row is persisted in main when `RunAgentForConversation` runs; keep local store in sync. */
    const list = agentStore.conversations[conversationId]
    if (list && !list.some((m) => m.id === id)) {
      list.push({
        id,
        role: 'user',
        content,
        createdAt: new Date(),
      })
    }
    void refreshPlanModeState(conversationId)
  },
})

function dedupeStoreRowsByIdLastWins(rows: StoreMessage[]): StoreMessage[] {
  if (rows.length <= 1) return rows
  const lastIdx = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) {
    lastIdx.set(rows[i].id, i)
  }
  return rows.filter((_, i) => lastIdx.get(rows[i].id) === i)
}

function storeMessagesToUi(rows: StoreMessage[]): UIMessage[] {
  const uniqueRows = dedupeStoreRowsByIdLastWins(rows)
  return uniqueRows.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [
      {
        type: 'text' as const,
        text: m.content,
        state: m.isStreaming ? ('streaming' as const) : ('done' as const),
      },
    ],
  }))
}

function conversationMeta(conversationId: string): Conversation | undefined {
  for (const convs of Object.values(agentStore.conversationList)) {
    const hit = convs.find((x) => x.id === conversationId)
    if (hit) return hit
  }
  return undefined
}

const headerTitle = computed(() => {
  const cid = agentStore.currentConversationId
  if (!cid) return 'New chat'
  return conversationMeta(cid)?.title ?? 'Conversation'
})

const chatStatus = computed(() => {
  const c = chatInst.value as unknown as {
    state?: { statusRef?: { value: string } }
  }
  return c?.state?.statusRef?.value ?? 'ready'
})

const isBusy = computed(() =>
  ['submitted', 'streaming'].includes(chatStatus.value),
)

const activeAgentName = computed(() => {
  const agent = agentStore.selectedAgent
  if (!agent) return 'Select an agent'
  return formatAgentGroupDisplayName(agent)
})
const activeAgentModel = computed(() => agentStore.selectedAgent?.model ?? '')
const activeAgentColor = computed(
  () => agentStore.selectedAgent?.color ?? 'neutral',
)

const contextWindowUsage = computed(() => {
  void chatUiContextWindowMessages.value
  if (!agentStore.currentConversationId) return null
  return computeContextWindowUsage({
    messageCount: agentStore.currentMessages.length,
    capacity: chatUiContextWindowMessages.value,
  })
})

const composerAgentOptions = computed(() =>
  agentStore.chatSelectableAgents.map((agent) => ({
    id: agent.id,
    name: agent.name,
  })),
)

const composerChatAgents = computed(() => agentStore.chatSelectableAgents)

const selectedAgentRequiresWorkspace = computed(() =>
  agentStore.selectedAgent
    ? agentRequiresWorkspace(agentStore.selectedAgent)
    : false,
)

const selectedAgentIsCoding = computed(() =>
  agentIsCodingAgent(agentStore.selectedAgent),
)

const selectedAgentIsGoogleWorkspace = computed(() =>
  agentIsGoogleWorkspaceAgent(agentStore.selectedAgent),
)

const workspaceComposerHint = computed(() => {
  if (!selectedAgentRequiresWorkspace.value) return null
  if (workspaceStore.activeWorkspacePath) return null
  return 'Select a project folder (toolbar folder icon) to edit and review code in this agent.'
})

const googleWorkspaceComposerHint = computed(() =>
  buildGoogleWorkspaceComposerHint({
    agentIsGoogleWorkspace: selectedAgentIsGoogleWorkspace.value,
    isSignedIn: googleWorkspaceSignedIn.value,
    hasWorkspaceAccess: googleWorkspaceHasAccess.value,
  }),
)

const composerSkillSetup = computed(() => {
  if (!skillSystemProperties.needsSetup.value) return null
  const skillName =
    agentStore.selectedAgent?.name?.trim() || 'this skill'
  return {
    needsSetup: true,
    title: t.value.chat.skillSetupTitle.replace('{skillName}', skillName),
    intro: t.value.chat.skillSetupIntro,
    loadingLabel: t.value.common.loading,
    saveLabel: t.value.chat.skillSetupSave,
    savingLabel: t.value.chat.skillSetupSaving,
    fields: skillSystemProperties.fields.value,
    loading: skillSystemProperties.loading.value,
    saving: skillSystemProperties.saving.value,
    canSave: skillSystemProperties.canSave.value,
    error: skillSystemProperties.error.value,
    onUpdateField: skillSystemProperties.setDraft,
    onSave: () => {
      void skillSystemProperties.save()
    },
  }
})

watch(selectedAgentIsGoogleWorkspace, (active) => {
  if (active) void refreshGoogleWorkspaceAccount()
})

const canSend = computed(() => {
  const text = draft.value.trim()
  const hasAttachments = attachmentSourcePaths.value.length > 0
  if (!text && !hasAttachments) return false
  if (text && isSkillSwitchCommand(text)) return true
  if (text && isAgentSlashCommand(text)) return true
  if (text && isWorkspaceSlashCommand(text)) return true
  if (
    text &&
    isSubAgentSlashCommand(text) &&
    subAgentSlashEnabled.value &&
    parseSubAgentSlashCommand(text, delegatableSubAgentTargets.value)
  ) {
    return true
  }
  if (!agentStore.selectedAgentId) return false
  if (skillSystemProperties.needsSetup.value) return false
  if (
    selectedAgentRequiresWorkspace.value &&
    !workspaceStore.activeWorkspacePath
  ) {
    return false
  }
  return true
})

const reactiveMessages = ref<UIMessage[]>([])

const showAgentGuide = computed(
  () =>
    reactiveMessages.value.length === 0 &&
    !isBusy.value &&
    !agentStore.isLoadingInitialConversations,
)

const conversationWorkspaceAttachments = computed(() =>
  collectConversationWorkspaceAttachments(reactiveMessages.value),
)

async function syncVisibleConversationFromStore(
  conversationId: string,
): Promise<void> {
  if (agentStore.currentConversationId !== conversationId) return
  if (agentStore.isConversationStreamActive(conversationId)) return

  await agentStore.refreshConversationMessagesTail(conversationId)

  const rows = agentStore.conversations[conversationId] ?? []
  const uiFromStore = storeMessagesToUi(rows)
  const chat = chatInst.value

  if (chat?.id === conversationId) {
    const merged = mergeLiveChatMessagesWithStore(chat.messages, uiFromStore)
    const uiMessages = normalizeChatMessagesForDisplay(merged)
    chat.messages = uiMessages
    setConversationChat(conversationId, chat)
    syncReactiveMessagesFromChat(uiMessages, { full: true })
    await nextTick()
    void scrollToBottomIfStuck('auto')
    return
  }

  await rebuildChat()
}

async function loadOlderMessagesForScroll(): Promise<boolean> {
  const conversationId = agentStore.currentConversationId
  if (!conversationId) return false
  if (!agentStore.conversationHasOlderMessages(conversationId)) return false

  const loaded = await agentStore.loadOlderConversationMessages(conversationId)
  if (!loaded) return false

  const rows = agentStore.conversations[conversationId] ?? []
  const uiFromStore = storeMessagesToUi(rows)
  const chat = chatInst.value
  if (chat?.id === conversationId) {
    const merged = mergeLiveChatMessagesWithStore(chat.messages, uiFromStore)
    chat.messages = normalizeChatMessagesForDisplay(merged)
    setConversationChat(conversationId, chat)
  }
  return true
}

const {
  visibleMessages,
  hasHiddenAbove,
  hasHiddenBelow,
  isLoadingOlder: isLoadingOlderMessages,
  resetWindow: resetMessageWindow,
  onScroll: onMessagesScroll,
  onWheel: onMessagesWheel,
  armStickToBottom,
  scrollToBottomIfStuck,
  startContentAutoScroll,
} = useChatMessageScrollWindow(reactiveMessages, messagesEl, {
  onLoadOlder: loadOlderMessagesForScroll,
  hasOlderOnServer: () => {
    const cid = agentStore.currentConversationId
    return cid ? agentStore.conversationHasOlderMessages(cid) : false
  },
  contentEl: messagesContentEl,
})

/** In-progress assistant row while the agent run is active (submitted / streaming). */
const thinkingAssistantMessageId = computed(() => {
  if (!isBusy.value) return null
  const msgs = reactiveMessages.value
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === 'assistant') return msgs[i].id
  }
  return null
})

watch(
  () => {
    const inst = chatInst.value as unknown as {
      state?: { messagesRef?: { value: UIMessage[] } }
    }
    const msgs = inst?.state?.messagesRef?.value
    if (!msgs?.length) return { len: 0, tailId: '', revision: 0 }
    const tail = msgs[msgs.length - 1]
    const tailRevision = tail
      ? tail.parts
          .map((p) => {
            if (p.type === 'text') {
              return `t:${(p.text ?? '').length}:${p.state ?? ''}`
            }
            if (p.type === 'reasoning') {
              return `r:${(p.text ?? '').length}:${p.state ?? ''}`
            }
            if (p.type === 'data-agent-step-progress') {
              const data = (
                p as { data?: { content?: string; status?: string } }
              ).data
              return `p:${(data?.content ?? '').length}:${data?.status ?? ''}`
            }
            return String(p.type)
          })
          .join('|')
      : ''
    return {
      len: msgs.length,
      tailId: tail?.id ?? '',
      tailRevision,
      msgs,
    }
  },
  (v) => {
    if (!v?.msgs?.length) {
      if (shouldPreserveReactiveMessagesWhenChatEmpty()) return
      syncReactiveMessagesFromChat(undefined)
      return
    }
    const conversationId = agentStore.currentConversationId ?? undefined
    scheduleUiFlush(
      'messages-sync',
      () => syncReactiveMessagesFromChat(v.msgs),
      { conversationId, priority: 'normal' },
    )
  },
  { immediate: true },
)

watch(
  () => {
    const msgs = reactiveMessages.value
    if (!msgs.length) return ''
    const tail = msgs[msgs.length - 1]
    return tail
      ? tail.parts
          .map((p) => {
            if (p.type === 'text') {
              return `t:${(p.text ?? '').length}:${p.state ?? ''}`
            }
            if (p.type === 'reasoning') {
              return `r:${(p.text ?? '').length}:${p.state ?? ''}`
            }
            if (p.type === 'data-agent-step-progress') {
              const data = (
                p as { data?: { content?: string; status?: string } }
              ).data
              return `p:${(data?.content ?? '').length}:${data?.status ?? ''}`
            }
            return String(p.type)
          })
          .join('|')
      : ''
  },
  () => {
    scheduleScrollToBottom('auto')
  },
)

watch(
  () => streamingTextBuffer.displayText.value,
  () => {
    scheduleScrollToBottom('auto')
  },
)

watch(draft, () => {
  scheduleScrollToBottom('auto')
})

watch(messageQueue, () => {
  scheduleScrollToBottom('auto')
})

function removeQueuedMessage(id: string) {
  messageQueue.value = messageQueue.value.filter((q) => q.id !== id)
}

function resolveActiveConversationId(): string | undefined {
  const fromChat = chatInst.value?.id?.trim()
  if (fromChat) return fromChat
  return agentStore.currentConversationId ?? undefined
}

const planDisplayStatus = computed(() =>
  resolvePlanModeDisplayStatus(
    planModeView.value,
    conversationHasPendingHitl(resolveActiveConversationId()),
  ),
)

const delegatableSubAgentTargets = computed(() => {
  const caller = agentStore.selectedAgent
  if (!caller) return []
  return resolveDelegatableSubAgentTargets(
    {
      id: caller.id,
      allowSubAgents: caller.allowSubAgents,
      subAgentIds: caller.subAgentIds ?? undefined,
    },
    agentStore.agents
      .filter((agent) => !isWorkflowPanelAgentId(agent.id))
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        allowAsSubAgent: agent.allowAsSubAgent,
      })),
  )
})

const subAgentSlashEnabled = computed(() => {
  const caller = agentStore.selectedAgent
  if (!caller) return false
  const status = planDisplayStatus.value
  if (status === 'planning' || status === 'plan_tool_execute') return false
  return resolveAllowSubAgents(caller.allowSubAgents)
})

function applyPlanModeView(view: PlanModeView) {
  planModeView.value = view
}

function messagesLookPendingHitl(messages: readonly UIMessage[]): boolean {
  return chatMessagesHavePendingHitl(messages)
}

function conversationHasPendingHitl(
  conversationId: string | undefined,
): boolean {
  if (!conversationId) return false
  if (conversationHitlBlocksQueue(conversationId)) return true
  const chat = chatInst.value
  if (chat?.id === conversationId && messagesLookPendingHitl(chat.messages)) {
    return true
  }
  if (
    agentStore.currentConversationId === conversationId &&
    messagesLookPendingHitl(reactiveMessages.value)
  ) {
    return true
  }
  return false
}

function canDequeueQueuedMessages(): boolean {
  const chat = chatInst.value
  const conversationId = resolveActiveConversationId()
  if (!chat || !conversationId || messageQueue.value.length === 0) return false
  if (isBusy.value) return false
  if (conversationHasPendingHitl(conversationId)) return false
  return true
}

async function dequeueAndSendNext(): Promise<void> {
  if (!canDequeueQueuedMessages()) return
  const chat = chatInst.value!
  const next = messageQueue.value[0]
  messageQueue.value = messageQueue.value.slice(1)
  try {
    const sendText =
      next.text.trim() ||
      (next.attachmentSourcePaths?.length
        ? `Attached ${next.attachmentSourcePaths.length} file${
            next.attachmentSourcePaths.length === 1 ? '' : 's'
          }`
        : '')
    await chat.sendMessage(
      { text: sendText },
      next.attachmentSourcePaths?.length
        ? { body: { attachmentSourcePaths: next.attachmentSourcePaths } }
        : undefined,
    )
    void loadConversationAttachments(chat.id)
  } catch {
    messageQueue.value = [next, ...messageQueue.value]
  }
}

watch(isBusy, (busy, wasBusy) => {
  if (wasBusy && !busy) void dequeueAndSendNext()
})

function createChatForConversation(
  conversationId: string,
  initial: UIMessage[],
): InstanceType<typeof Chat> {
  return new Chat<UIMessage>({
    id: conversationId,
    messages: initial,
    generateId: chatGenerateId,
    transport,
    sendAutomaticallyWhen: (opts) =>
      lastAssistantMessageIsCompleteWithApprovalResponses(opts) ||
      lastAssistantMessageIsCompleteWithCollectFormResponses(opts),

    async onFinish({ isAbort }) {
      const chat = getConversationChat(conversationId) ?? chatInst.value
      const pendingHitl = conversationHasPendingHitl(conversationId)

      agentStore.markUiChatInFlight(conversationId, false)

      if (!isAbort) {
        void refreshPlanModeState(conversationId)
      }

      if (isAbort) {
        clearConversationChatCache(conversationId)
        return
      }

      if (pendingHitl) {
        if (chat) syncConversationSnapshot(conversationId)
        return
      }

      await agentStore.refreshConversationMessagesTail(conversationId)

      const rows = agentStore.conversations[conversationId] ?? []
      const uiFromStore = storeMessagesToUi(rows)
      const merged = mergeLiveChatMessagesWithStore(
        chat?.messages ?? [],
        uiFromStore,
      )
      const uiMessages = normalizeChatMessagesForDisplay(merged)
      if (chat) {
        chat.messages = uiMessages
        setConversationChat(conversationId, chat)
      } else if (chatInst.value?.id === conversationId) {
        const rebuilt = createChatForConversation(conversationId, uiMessages)
        setConversationChat(conversationId, rebuilt)
        chatInst.value = rebuilt
      }

      if (chatInst.value?.id === conversationId) {
        await nextTick()
        const mergedChat = getConversationChat(conversationId) ?? chatInst.value
        syncReactiveMessagesFromChat(mergedChat?.messages ?? uiMessages, {
          full: true,
        })
        await dequeueAndSendNext()
      }
    },
  })
}

async function rebuildChat() {
  const conversationId = agentStore.currentConversationId

  const previousViewedId = lastViewedConversationId.value
  if (
    previousViewedId &&
    conversationId !== previousViewedId &&
    chatInst.value
  ) {
    stashConversationChat(previousViewedId, chatInst.value, messageQueue.value)
  }

  if (conversationId !== previousViewedId) {
    messageQueue.value = []
  }

  if (!conversationId) {
    chatInst.value = null
    lastViewedConversationId.value = null
    return
  }

  await agentStore.selectConversation(conversationId, false)

  const cached = getConversationChat(conversationId)
  if (cached) {
    messageQueue.value = getConversationQueue(conversationId)
    chatInst.value = cached
    lastViewedConversationId.value = conversationId
    reactiveMessages.value = normalizeChatMessagesForDisplay(cached.messages)
    resetMessageWindow(true)
    await nextTick()
    void scrollToBottomIfStuck('auto')
    return
  }

  const inFlight = agentStore.isConversationStreamActive(conversationId)
  const snapshot = getConversationSnapshot(conversationId)
  const storeUi = storeMessagesToUi(
    agentStore.conversations[conversationId] ?? [],
  )
  const initial =
    inFlight && snapshot?.length
      ? snapshot
      : snapshot?.length
        ? mergeLiveChatMessagesWithStore(snapshot, storeUi)
        : storeUi

  const chat = createChatForConversation(conversationId, initial)
  setConversationChat(conversationId, chat)
  chatInst.value = chat
  lastViewedConversationId.value = conversationId
  reactiveMessages.value = normalizeChatMessagesForDisplay(initial)
  resetMessageWindow(true)
  await nextTick()
  void scrollToBottomIfStuck('auto')
}

watch(
  () => agentStore.currentConversationId,
  (conversationId, previousId) => {
    if (previousId) {
      flushAllUiForConversation(previousId)
      scheduleSnapshot(previousId, true)
    }
    setVisibleConversationForUiFlush(conversationId)
    streamingTextBuffer.clear()
    void rebuildChat()
    if (conversationId) {
      void loadCodingMode(conversationId)
      void loadPlanModeState(conversationId)
      if (selectedAgentIsCoding.value) startBackgroundTaskPolling()
    } else {
      codingMode.value = DEFAULT_CODING_MODE
      planModeView.value = defaultPlanModeView()
      backgroundTasks.value = []
      stopBackgroundTaskPolling()
    }
  },
  { flush: 'post' },
)

function onPlanModeStateChanged(
  _event: unknown,
  payload: { conversationId?: string; view?: PlanModeView },
) {
  const conversationId = payload?.conversationId?.trim()
  if (!conversationId || conversationId !== resolveActiveConversationId())
    return
  if (payload.view) applyPlanModeView(payload.view)
}

let unregisterConversationStoreUiSync: (() => void) | null = null
let stopContentAutoScroll: (() => void) | null = null
let stopSandboxPreviewRequestWatch: (() => void) | null = null

stopSandboxPreviewRequestWatch = bindSandboxPreviewRequest(openSandboxPreview)

onMounted(() => {
  chatBodyEl.value?.addEventListener(
    'click',
    onChatBodySandboxPreviewClick,
    true,
  )
  setVisibleConversationForUiFlush(agentStore.currentConversationId)
  stopContentAutoScroll = startContentAutoScroll()
  unregisterConversationStoreUiSync = registerConversationStoreUiSync(
    syncVisibleConversationFromStore,
  )
  void rebuildChat()
  const cid = agentStore.currentConversationId
  if (cid) {
    void loadCodingMode(cid)
    void loadPlanModeState(cid)
    void loadConversationAttachments(cid)
    if (selectedAgentIsCoding.value) startBackgroundTaskPolling()
  }
  window.ipcRendererChannel?.PlanModeStateChanged?.on?.(onPlanModeStateChanged)
  window.ipcRendererChannel?.AgentSandboxOutput?.on?.((_e, payload) => {
    agentStore.recordSandboxOutput(payload)
  })
  applyPendingWorkspaceSplitOpen()
})

watch(
  () => agentStore.selectedAgentId,
  (agentId, previousId) => {
    if (!agentId || agentId === previousId) return
    if (!selectedAgentIsCoding.value) {
      stopBackgroundTaskPolling()
      backgroundTasks.value = []
    } else {
      startBackgroundTaskPolling()
    }
    // Agent-scoped refresh when switching agents (base buckets warmed at app startup).
    void window.ipcRendererChannel?.WarmAgentCache?.invoke?.({
      userId: DEFAULT_USER_ID,
      agentId,
    })
  },
)

watch(
  () => agentStore.currentConversationId,
  (conversationId) => {
    setVisibleConversationForUiFlush(conversationId)
    clearStaging()
    void loadConversationAttachments(conversationId)
  },
)

onUnmounted(() => {
  chatBodyEl.value?.removeEventListener(
    'click',
    onChatBodySandboxPreviewClick,
    true,
  )
  stopContentAutoScroll?.()
  stopContentAutoScroll = null
  stopSandboxPreviewRequestWatch?.()
  stopSandboxPreviewRequestWatch = null
  unregisterConversationStoreUiSync?.()
  unregisterConversationStoreUiSync = null
  stopBackgroundTaskPolling()
  window.ipcRendererChannel?.PlanModeStateChanged?.removeListener?.(
    onPlanModeStateChanged,
  )
  window.ipcRendererChannel?.AgentSandboxOutput?.removeAllListeners?.()
})

async function onCollectFormSubmit(payload: {
  requestId: string
  values: Record<string, unknown>
}) {
  const chat = chatInst.value
  if (!chat) return
  await chat.sendMessage({
    role: 'user',
    parts: [
      {
        type: 'data-collect-form-response',
        id: payload.requestId,
        data: { values: payload.values },
      },
    ],
  } as Parameters<typeof chat.sendMessage>[0])
}

function onToolApproval(payload: {
  part: unknown
  approved: boolean
  approveForSession?: boolean
  feedback?: string
}) {
  const id = (payload.part as { approval?: { id?: string } }).approval?.id
  if (!id || !chatInst.value) return

  if (payload.approveForSession && payload.approved) {
    const conversationId = agentStore.currentConversationId
    const toolName = toolPartDisplayName(payload.part)
    if (conversationId && toolName) {
      void window.ipcRendererChannel?.AddSessionToolApproval?.invoke({
        conversationId,
        toolName,
      })
    }
  }

  void chatInst.value.addToolApprovalResponse({
    id,
    approved: payload.approved,
  })

  const conversationId = agentStore.currentConversationId
  if (conversationId) {
    setConversationHitlBlocksQueue(conversationId, false)
    if (payload.approved && isExitPlanModeToolPart(payload.part)) {
      applyPlanModeView({
        status: 'plan_tool_execute',
        planSlug: planModeView.value.planSlug,
      })
    }
    void refreshPlanModeState(conversationId)
  }

  const feedback = payload.feedback?.trim()
  if (!payload.approved && feedback) {
    void chatInst.value.sendMessage({ text: feedback })
  }
}

async function loadCodingMode(conversationId: string) {
  const ch = window.ipcRendererChannel?.GetCodingMode
  if (!ch) {
    codingMode.value = DEFAULT_CODING_MODE
    return
  }
  const result = await ch.invoke({ conversationId })
  codingMode.value = result.ok ? result.mode : DEFAULT_CODING_MODE
}

async function loadPlanModeState(conversationId: string) {
  const ch = window.ipcRendererChannel?.GetPlanModeState
  if (!ch) {
    applyPlanModeView(defaultPlanModeView())
    return
  }
  const result = await ch.invoke({ conversationId })
  applyPlanModeView(result.ok ? result.view : defaultPlanModeView())
}

/** Re-fetch plan status from main after server-side transitions (exit_plan_mode, todos done, etc.). */
async function refreshPlanModeState(conversationId: string | undefined) {
  const id = conversationId?.trim()
  if (!id) return
  await loadPlanModeState(id)
}

async function ensureConversationForModeCommands(): Promise<string | null> {
  const existing = agentStore.currentConversationId
  if (existing) return existing
  if (!agentStore.selectedAgentId) {
    toast.add({
      title: 'No agent selected',
      description: 'Select an agent before changing explore or YOLO mode.',
      color: 'warning',
    })
    return null
  }
  const conv = await agentStore.createNewConversation()
  if (!conv) return null
  await nextTick()
  await rebuildChat()
  return conv.id
}

async function activateAgentExploreModeFromSlash(subcommand?: string) {
  const conversationId = await ensureConversationForModeCommands()
  if (!conversationId) return
  const ch = window.ipcRendererChannel?.TransitionPlanMode
  if (!ch) return

  if (subcommand?.toLowerCase() === 'clear') {
    const result = await ch.invoke({
      conversationId,
      action: 'resetToIdle',
    })
    if (result.ok) {
      applyPlanModeView(result.view)
      toast.add({
        title: 'Exploring cleared',
        description: 'Exploring was reset.',
        color: 'neutral',
      })
    }
    return
  }

  const result = await ch.invoke({
    conversationId,
    action: 'activatePlanning',
  })
  if (result.ok) {
    applyPlanModeView(result.view)
    toast.add({
      title: 'Exploring',
      description:
        'Agent will explore read-only. Send a message to start, or the agent can call enter_plan_mode.',
      color: 'neutral',
    })
  }
}

async function onCodingModeChange(mode: CodingMode) {
  if (mode !== 'yolo' && !selectedAgentIsCoding.value) return
  const conversationId = await ensureConversationForModeCommands()
  if (!conversationId) return
  const ch = window.ipcRendererChannel?.SetCodingMode
  if (!ch) return
  const result = await ch.invoke({ conversationId, mode })
  if (result.ok) {
    codingMode.value = result.mode
    toast.add({
      title: `${codingModeLabel(result.mode)} mode`,
      description:
        result.mode === 'normal'
          ? 'Standard approval flow restored.'
          : `${codingModeLabel(result.mode)} mode enabled for this conversation.`,
      color: 'neutral',
    })
  }
}

function requireCodingAgentForSlash(command: string): boolean {
  if (selectedAgentIsCoding.value) return true
  toast.add({
    title: 'Coding agent only',
    description: `${command} is only available when the Coding agent is selected.`,
    color: 'warning',
  })
  return false
}

async function toggleCodingModeFromSlash(mode: CodingMode) {
  if (mode !== 'yolo' && !requireCodingAgentForSlash(`/${mode}`)) return
  const conversationId = await ensureConversationForModeCommands()
  if (!conversationId) {
    return
  }
  const next = codingMode.value === mode ? 'normal' : mode
  await onCodingModeChange(next)
}

async function runHelpCommand() {
  toast.add({
    title: 'Slash commands',
    description: formatSlashHelp(
      selectedAgentIsCoding.value,
      agentStore.chatSelectableAgents,
      subAgentSlashEnabled.value ? delegatableSubAgentTargets.value : [],
    ),
    color: 'neutral',
  })
}

async function runAgentCommand(action: AgentSlashAction) {
  if (action.kind === 'status') {
    toast.add({
      title: 'Agent',
      description: [
        describeAgentSlashStatus(
          agentStore.selectedAgentId,
          agentStore.chatSelectableAgents,
        ),
        '',
        formatAgentSwitchHelp(agentStore.chatSelectableAgents),
      ].join('\n'),
      color: 'neutral',
    })
    return
  }

  if (action.kind === 'pick') {
    if (!openComposerAgentPicker()) {
      toast.add({
        title: 'Agent picker unavailable',
        description: 'Open the chat composer and try /agent pick again.',
        color: 'warning',
      })
    }
    return
  }

  const agentId = resolveAgentIdForAgentSwitch(
    agentStore.chatSelectableAgents,
    action.target,
  )
  if (!agentId) {
    toast.add({
      title: 'Agent not found',
      description: `No enabled agent matches "${action.target}". Use /agent to list targets.`,
      color: 'warning',
    })
    return
  }

  const agent = agentStore.chatSelectableAgents.find(
    (entry) => entry.id === agentId,
  )
  if (agentId === agentStore.selectedAgentId) {
    toast.add({
      title: 'Already selected',
      description: `${agent?.name ?? action.target} is already selected.`,
      color: 'neutral',
    })
    return
  }

  await agentStore.selectAgent(agentId)
  toast.add({
    title: 'Agent switched',
    description: `Now using ${agent?.name ?? action.target}.`,
    color: 'success',
  })
}

async function runSkillSwitchCommand(target: string) {
  const agentId = resolveAgentIdForSkillSwitch(
    agentStore.chatSelectableAgents,
    target,
  )
  if (!agentId) {
    toast.add({
      title: 'Skill not found',
      description: `No enabled skill agent matches "${target}". Use /help to list /skill:<id> targets.`,
      color: 'warning',
    })
    return
  }

  const agent = agentStore.chatSelectableAgents.find((a) => a.id === agentId)
  if (agentId === agentStore.selectedAgentId) {
    toast.add({
      title: 'Already on skill',
      description: `${agent?.name ?? target} is already selected.`,
      color: 'neutral',
    })
    return
  }

  await agentStore.selectAgent(agentId)
  toast.add({
    title: 'Skill switched',
    description: `Now using ${agent?.name ?? target}.`,
    color: 'success',
  })
}

function workspaceMutationBlocked(): boolean {
  if (!isBusy.value) return false
  toast.add({
    title: 'Agent is running',
    description:
      'Cannot change workspace while the agent is running for this conversation.',
    color: 'warning',
  })
  return true
}

async function runWorkspaceCommand(action: WorkspaceSlashAction) {
  const hasConversation = Boolean(agentStore.currentConversationId?.trim())

  if (action.kind === 'status') {
    toast.add({
      title: 'Workspace',
      description: [
        describeWorkspaceSlashStatus(
          workspaceStore.activeWorkspacePath,
          workspaceStore.pendingWorkspacePath,
          hasConversation,
        ),
        '',
        formatWorkspaceSlashHelp(),
      ].join('\n'),
      color: 'neutral',
    })
    return
  }

  if (workspaceMutationBlocked()) return

  if (action.kind === 'pick') {
    await workspaceStore.selectAndSetWorkspace()
    if (workspaceStore.lastError) {
      toast.add({
        title: 'Workspace not updated',
        description: workspaceStore.lastError,
        color: 'error',
      })
      return
    }
    const path =
      workspaceStore.activeWorkspacePath ?? workspaceStore.pendingWorkspacePath
    toast.add({
      title: path ? 'Workspace updated' : 'Workspace unchanged',
      description: path
        ? describeWorkspaceSlashStatus(
            workspaceStore.activeWorkspacePath,
            workspaceStore.pendingWorkspacePath,
            hasConversation,
          )
        : 'No folder was selected.',
      color: path ? 'success' : 'neutral',
    })
    return
  }

  if (action.kind === 'clear') {
    await workspaceStore.clearWorkspace()
    if (workspaceStore.lastError) {
      toast.add({
        title: 'Workspace not cleared',
        description: workspaceStore.lastError,
        color: 'error',
      })
      return
    }
    toast.add({
      title: 'Workspace cleared',
      description: 'Using sandbox only for this conversation.',
      color: 'success',
    })
    return
  }

  const ok = await workspaceStore.setWorkspaceByPath(action.path)
  if (!ok) {
    toast.add({
      title: 'Workspace not set',
      description:
        workspaceStore.lastError ??
        `Could not set workspace to "${action.path}".`,
      color: 'error',
    })
    return
  }

  toast.add({
    title: 'Workspace updated',
    description: describeWorkspaceSlashStatus(
      workspaceStore.activeWorkspacePath,
      workspaceStore.pendingWorkspacePath,
      hasConversation,
    ),
    color: 'success',
  })
}

async function runMcpCommand(args: string) {
  if (!requireCodingAgentForSlash('/mcp')) return
  const trimmed = args.trim()
  const addMatch = trimmed.match(/^add\s+(\S+)\s+(.+)$/i)
  if (addMatch) {
    const [, name, commandLine] = addMatch
    const parts = commandLine.trim().split(/\s+/)
    const command = parts[0] ?? ''
    const cmdArgs = parts.slice(1)
    const ch = window.ipcRendererChannel?.CreateMcpServer
    if (!ch) return
    const id = `mcp-${name}-${Date.now()}`
    await ch.invoke({
      id,
      userId: DEFAULT_USER_ID,
      name,
      transportType: 'stdio',
      command,
      args: cmdArgs,
      enabled: true,
    })
    toast.add({
      title: 'MCP server added',
      description: `${name} (${command} ${cmdArgs.join(' ')})`,
      color: 'success',
    })
    return
  }

  const listCh = window.ipcRendererChannel?.ListMcpServers
  if (!listCh) return
  const servers = await listCh.invoke({ userId: DEFAULT_USER_ID })
  const lines =
    servers.length === 0
      ? 'No MCP servers configured. Use `/mcp add <name> <command> [args…]` to add a stdio server.'
      : servers
          .map(
            (s) =>
              `${s.enabled ? '●' : '○'} ${s.name} (${s.transportType}) — ${s.command || s.url}`,
          )
          .join('\n')
  toast.add({
    title: 'MCP servers',
    description: lines,
    color: 'neutral',
  })
}

async function runInstallSkillCommand(url: string) {
  if (!requireCodingAgentForSlash('/skill:install')) return
  const ch = window.ipcRendererChannel?.InstallSkillFromGithub
  if (!ch) return
  const result = await ch.invoke({ url })
  if (!result.ok) {
    toast.add({
      title: 'Skill install failed',
      description: result.error ?? 'Unknown error',
      color: 'error',
    })
    return
  }
  toast.add({
    title: 'Skill installed',
    description: `Installed skill "${result.skillId}" from GitHub.`,
    color: 'success',
  })
}

async function refreshBackgroundTasks() {
  const conversationId = agentStore.currentConversationId ?? undefined
  const ch = window.ipcRendererChannel?.ListBackgroundTasks
  if (!ch) return
  const tasks = await ch.invoke({ conversationId })
  backgroundTasks.value = tasks
    .filter((t) => t.kind === 'shell')
    .map((t) => ({
      id: t.id,
      label: t.label,
      status: t.status,
      output: t.output,
      error: t.error,
    }))
}

function onCancelBackgroundTask(taskId: string) {
  void window.ipcRendererChannel?.CancelBackgroundTask?.invoke({ taskId }).then(
    () => refreshBackgroundTasks(),
  )
}

function startBackgroundTaskPolling() {
  stopBackgroundTaskPolling()
  void refreshBackgroundTasks()
  backgroundTaskPollTimer = setInterval(() => {
    void refreshBackgroundTasks()
  }, 3000)
}

function stopBackgroundTaskPolling() {
  if (backgroundTaskPollTimer) {
    clearInterval(backgroundTaskPollTimer)
    backgroundTaskPollTimer = null
  }
}

async function runCompactCommand(conversationId: string, hint: string) {
  const ch = window.ipcRendererChannel?.CompactConversation
  if (!ch) return
  const result = await ch.invoke({
    conversationId,
    hint: hint || undefined,
    userId: DEFAULT_USER_ID,
  })
  if (!result.ok) {
    toast.add({
      title: 'Compaction failed',
      description: result.error ?? 'Unknown error',
      color: 'error',
    })
    return
  }
  if (result.compacted) {
    clearConversationChatCache(conversationId)
    await agentStore.loadConversationMessages(conversationId)
    await rebuildChat()
    toast.add({
      title: 'History compacted',
      description: 'Older messages were summarized into a hand-off note.',
      color: 'success',
    })
    return
  }
  toast.add({
    title: 'Nothing to compact',
    description: result.message ?? 'History is already short.',
    color: 'neutral',
  })
}

async function onSubmit() {
  const text = draft.value.trim()
  const sourcePaths = [...attachmentSourcePaths.value]
  if (!text && sourcePaths.length === 0) return

  const skillSwitchTarget = text ? parseSkillSwitchCommand(text) : null
  if (skillSwitchTarget) {
    draft.value = ''
    await runSkillSwitchCommand(skillSwitchTarget)
    return
  }

  const agentAction = parseAgentSlashCommand(text)
  if (agentAction) {
    draft.value = ''
    await runAgentCommand(agentAction)
    return
  }

  const workspaceAction = parseWorkspaceSlashCommand(text)
  if (workspaceAction) {
    draft.value = ''
    await runWorkspaceCommand(workspaceAction)
    return
  }

  const agentId = agentStore.selectedAgentId
  let conversationId = agentStore.currentConversationId ?? undefined

  if (!agentId) return

  const compactMatch = text.match(COMPACT_CMD_RE)
  if (compactMatch) {
    draft.value = ''
    if (!conversationId) {
      toast.add({
        title: 'No conversation',
        description: 'Start a conversation before running /compact.',
        color: 'warning',
      })
      return
    }
    await runCompactCommand(conversationId, compactMatch[1]?.trim() ?? '')
    return
  }

  const exploreMatch =
    text.match(EXPLORE_CMD_RE) ?? text.match(PLAN_CMD_ALIAS_RE)
  if (exploreMatch) {
    draft.value = ''
    await activateAgentExploreModeFromSlash(exploreMatch[1]?.trim())
    return
  }

  const modeMatch = text.match(MODE_CMD_RE)
  if (modeMatch) {
    draft.value = ''
    await toggleCodingModeFromSlash(parseCodingMode(modeMatch[1].toLowerCase()))
    return
  }

  if (HELP_CMD_RE.test(text)) {
    draft.value = ''
    await runHelpCommand()
    return
  }

  const mcpMatch = text.match(MCP_CMD_RE)
  if (mcpMatch) {
    draft.value = ''
    await runMcpCommand(mcpMatch[1]?.trim() ?? '')
    return
  }

  const skillInstallMatch = text.match(INSTALL_SKILL_CMD_RE)
  if (skillInstallMatch) {
    draft.value = ''
    await runInstallSkillCommand(skillInstallMatch[1])
    return
  }

  if (!conversationId) {
    const autoTitle = text.length > 60 ? `${text.slice(0, 57)}…` : text
    const conv = await agentStore.createNewConversation(autoTitle)
    if (!conv) return
    conversationId = conv.id
    await nextTick()
    await rebuildChat()
  } else if (
    conversationMeta(conversationId)?.title === 'New Conversation' &&
    (agentStore.conversations[conversationId]?.length ?? 0) === 0
  ) {
    const autoTitle = text.length > 60 ? `${text.slice(0, 57)}…` : text
    await agentStore.renameConversation(conversationId, autoTitle)
  }

  if (!chatInst.value) await rebuildChat()

  const subAgentDelegation = subAgentSlashEnabled.value
    ? parseSubAgentSlashCommand(text, delegatableSubAgentTargets.value)
    : null

  if (
    isSubAgentSlashCommand(text) &&
    subAgentSlashEnabled.value &&
    !subAgentDelegation
  ) {
    toast.add({
      title: 'Invalid /sub-agent command',
      description:
        'Use /sub-agent @<slug> <task> (for example: /sub-agent @code fix the bug).',
      color: 'warning',
    })
    return
  }

  const pendingHitl = conversationHasPendingHitl(conversationId)

  if (isBusy.value || pendingHitl) {
    messageQueue.value = [
      ...messageQueue.value,
      {
        id: crypto.randomUUID(),
        text: text || sendTextForAttachments(sourcePaths),
        attachmentSourcePaths: sourcePaths.length > 0 ? sourcePaths : undefined,
      },
    ]
    draft.value = ''
    clearStaging()
    armStickToBottom()
    scheduleScrollToBottom('auto')
    return
  }

  draft.value = ''
  clearStaging()
  armStickToBottom()
  scheduleScrollToBottom('auto')
  const sendText = text || sendTextForAttachments(sourcePaths)
  if (subAgentDelegation) {
    await chatInst.value!.sendMessage(
      { text: sendText },
      {
        body: {
          subAgentMention: {
            targetAgentId: subAgentDelegation.agentId,
            task: subAgentDelegation.task,
          },
          attachmentSourcePaths: sourcePaths,
        },
      },
    )
    void loadConversationAttachments(conversationId)
    return
  }
  await chatInst.value!.sendMessage(
    { text: sendText },
    sourcePaths.length > 0
      ? { body: { attachmentSourcePaths: sourcePaths } }
      : undefined,
  )
  void loadConversationAttachments(conversationId)
}

function onSelectAgent(agentId: string) {
  if (!agentId || agentId === agentStore.selectedAgentId) return
  void agentStore.selectAgent(agentId)
}

function onStop() {
  const cid = chatInst.value?.id
  if (typeof cid === 'string' && cid.trim()) {
    agentStore.markUiChatInFlight(cid.trim(), false)
  }
  void chatInst.value?.stop()
}

function toggleSidebar() {
  emit('toggle-sidebar')
}

function toggleReportPanel() {
  showReportPanel.value = !showReportPanel.value
}

function closeWorkspaceSplitPanel() {
  showWorkspaceSplitPanel.value = false
}

function applyPendingWorkspaceSplitOpen() {
  if (workspaceNavStore.consumeOpenSplitPanelRequest()) {
    showWorkspaceSplitPanel.value = true
  }
}

watch(
  () => workspaceNavStore.openSplitPanel,
  (shouldOpen) => {
    if (shouldOpen) applyPendingWorkspaceSplitOpen()
  },
)

async function startNewSessionFromTitleBar() {
  const conv = await agentStore.createNewConversation()
  if (!conv) return
  await agentStore.selectConversation(conv.id)
}

watchEffect(() => {
  setTitleBarChatControls({
    visible: true,
    title: headerTitle.value,
    activeAgentName: activeAgentName.value,
    activeAgentModel: activeAgentModel.value,
    sidebarCollapsed: props.sidebarCollapsed,
    showReportPanel: showReportPanel.value,
    isBusy: isBusy.value,
    onToggleSidebar: toggleSidebar,
    onToggleReportPanel: toggleReportPanel,
    onStop,
    onNewSession: startNewSessionFromTitleBar,
  })
})
</script>

<style scoped>
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-bg);
}
.chat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.chat-body--resizing {
  cursor: col-resize;
  user-select: none;
}
.chat-body--resizing .chat-main {
  pointer-events: none;
}
.chat-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /** Min width for assistant response bubbles (brief + conversation). */
  --chat-response-bubble-min-width: 50%;
}
.chat-scroll-area {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}
.chat-conversation-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: color-mix(in srgb, var(--ui-bg) 88%, transparent);
  color: var(--ui-text-muted);
  font-size: 13px;
}
.chat-conversation-loading__icon {
  width: 22px;
  height: 22px;
  animation: chat-conversation-loading-spin 0.9s linear infinite;
}
@keyframes chat-conversation-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
.chat-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-anchor: none;
  padding: 16px;
}
.chat-scroll__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}
.chat-scroll__content > * {
  flex-shrink: 0;
}
.chat-scroll-edge {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 4px 0 8px;
}
.chat-scroll-edge--bottom {
  padding: 8px 0 4px;
}
.chat-scroll-edge__label {
  font-size: 11px;
  color: var(--ui-text-muted);
}
.msg-row {
  flex-shrink: 0;
  max-width: 92%;
  min-width: var(--chat-response-bubble-min-width, 50%);
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text);
}
.msg-row--user {
  align-self: flex-end;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
}
.msg-row--assistant {
  align-self: flex-start;
  min-width: var(--chat-response-bubble-min-width, 50%);
  background: var(--ui-bg-elevated);
}

/* Conversation mode: grey background per step bubble, not the whole assistant row. */
.msg-row--assistant:has(.assistant-msg-parts--conversation) {
  background: transparent;
  border: none;
  padding: 0;
  min-width: var(--chat-response-bubble-min-width, 50%);
  max-width: 100%;
}

.message-queue {
  align-self: stretch;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px dashed
    color-mix(in srgb, var(--color-primary-500) 35%, var(--ui-border));
  background: color-mix(
    in srgb,
    var(--color-primary-500) 6%,
    var(--ui-bg-elevated)
  );
}
.message-queue__title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-muted);
}
.message-queue__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.message-queue__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  font-size: 13px;
  line-height: 1.45;
}
.message-queue__text {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.message-queue__remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}
.message-queue__remove:hover {
  background: color-mix(in srgb, var(--ui-text) 8%, transparent);
  color: var(--ui-text);
}
.message-queue__remove-icon {
  width: 16px;
  height: 16px;
}
.chat-attachment-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-warning-600, #d97706);
  line-height: 1.4;
}
</style>
