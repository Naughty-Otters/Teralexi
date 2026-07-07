<template>
  <div class="agent-app">
    <div
      ref="layoutEl"
      class="agent-layout"
      :class="{ 'agent-layout--resizing': sidebarResizing }"
    >
      <!-- ── Left Sidebar ── -->
      <aside
        class="sidebar"
        :class="{ 'sidebar-collapsed': sidebarCollapsed }"
        :style="sidebarStyle"
      >
        <div class="sidebar-brand">
          <div class="brand-logo"><TeralexiLogo /></div>
          <span class="brand-name">{{ t.app.name }}</span>
        </div>
        <AgentList
          :collapsed="sidebarCollapsed"
          @navigate-chat="rightPanelView = 'chat'"
        />
        <SidebarFooter
          :right-panel-view="rightPanelView"
          :is-signed-in="isSignedIn"
          @toggle-settings="
            rightPanelView = rightPanelView === 'settings' ? 'chat' : 'settings'
          "
          @open-monitor="onOpenMonitor"
          @open-workspace="
            rightPanelView = rightPanelView === 'workspace' ? 'chat' : 'workspace'
          "
          @open-setup-wizard="onOpenSetupWizard"
        />
      </aside>

      <PanelResizeHandle
        v-if="!sidebarCollapsed"
        placement="after-start"
        :active="sidebarResizing"
        aria-label="Resize conversation list"
        @pointerdown="onSidebarResizePointerDown"
        @keyboard-resize="onSidebarKeyboardResize"
      />

      <!-- ── Right Panel ── -->
      <main class="right-panel">
        <SettingsPanel
          v-if="rightPanelView === 'settings'"
          @close="rightPanelView = 'chat'"
        />
        <MonitorPanel
          v-else-if="rightPanelView === 'monitor'"
          @close="rightPanelView = 'chat'"
        />
        <WorkspacePanel
          v-else-if="rightPanelView === 'workspace'"
          @close="rightPanelView = 'chat'"
        />
        <WorkflowPanel
          v-else-if="rightPanelView === 'workflows'"
          @close="rightPanelView = 'chat'"
        />
        <ChatPanel
          v-else-if="chatPanelMounted"
          :sidebar-collapsed="sidebarCollapsed"
          @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
        />
        <div
          v-else
          class="right-panel-boot-loading"
          role="status"
          aria-live="polite"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="right-panel-boot-loading__icon"
            aria-hidden="true"
          />
          <span>{{ t.common.loading }}</span>
        </div>
      </main>
    </div>

    <StartupStatusBar :message="startupStatus" />

    <ProviderSetupWizard
      v-if="isSignedIn"
      :open="providerSetupOpen"
      @close="providerSetupOpen = false"
      @finished="onProviderSetupFinished"
    />

    <div
      v-if="signInGateOpen"
      class="sign-in-gate-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="signInGateOpen = false"
    >
      <div class="sign-in-gate-modal">
        <button
          type="button"
          class="sign-in-gate-close"
          aria-label="Close"
          @click="signInGateOpen = false"
        >
          ✕
        </button>
        <SignInRequiredPanel
          :description="signInGateDescription"
          :hint="t.auth.localLlmHint"
          :secondary-action-label="t.auth.openLocalLlmSettings"
          @signed-in="onSignInGateSuccess"
          @secondary-action="onOpenLocalLlmFromGate"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, watchEffect, nextTick, defineAsyncComponent } from 'vue'
import { storeToRefs } from 'pinia'
import { useAgentStore } from '@store/agent'
import { useWorkspaceStore } from '@store/workspace'
import { useWorkspaceNavigationStore } from '@store/workspace-navigation'
import { isBoundSessionId } from '@shared/conversation/session-id'
import { useHorizontalPanelResize } from '@renderer/composables/useHorizontalPanelResize'
import {
  resetTitleBarChatControls,
  setTitleBarChatControls,
} from '@renderer/composables/useTitleBarChatControls'
import PanelResizeHandle from '@renderer/components/PanelResizeHandle.vue'
import TeralexiLogo from './components/teralexiLogo.vue'
import AgentList from './components/AgentList.vue'
import SidebarFooter from './components/SidebarFooter.vue'

const ChatPanel = defineAsyncComponent(
  () => import('./components/ChatPanel.vue'),
)
const SettingsPanel = defineAsyncComponent(
  () => import('./components/SettingsPanel.vue'),
)
const MonitorPanel = defineAsyncComponent(
  () => import('./components/MonitorPanel.vue'),
)
const WorkspacePanel = defineAsyncComponent(
  () => import('./components/WorkspacePanel.vue'),
)
const WorkflowPanel = defineAsyncComponent(
  () => import('@renderer/views/workflows/WorkflowPanel.vue'),
)
const ProviderSetupWizard = defineAsyncComponent(
  () => import('./components/ProviderSetupWizard.vue'),
)
const SignInRequiredPanel = defineAsyncComponent(
  () => import('./components/SignInRequiredPanel.vue'),
)
import {
  registerAppUpdateAboutHandler,
} from '@renderer/composables/useAppUpdateNavigation'
import { useAppUpdate } from '@renderer/composables/useAppUpdate'
import { getConversationChat } from './conversation-chat-session'
import {
  flushStoreStreamSync,
  initStoreStreamSync,
  queueStoreStepProgress,
  queueStoreTextDelta,
  syncStoreAssistantFromUiMessage,
} from './perf/storeStreamSync'
import { loadChatUiSettings } from './chatUiSettings'
import { loadAppLocale } from '@renderer/i18n/appLocaleSettings'
import { useI18n } from '@renderer/composables/useI18n'
import { runConversationStoreUiSync } from './conversationStoreUiSync'
import { useGoogleAccount } from '@renderer/composables/useGoogleAccount'
import { PROVIDER_SETUP_SESSION_KEY } from '@renderer/lib/provider-setup-session'
import { requestSandboxPreview } from './sandboxPreviewBridge'
import { useAgentStartupBootstrap } from '@renderer/composables/useAgentStartupBootstrap'
import StartupStatusBar from './components/StartupStatusBar.vue'

const { t } = useI18n()
const { isSignedIn } = useGoogleAccount()

const toast = useToast()
const { state: appUpdateState } = useAppUpdate()

const agentStore = useAgentStore()
const { statusMessage: startupStatus, run: runStartupBootstrap } =
  useAgentStartupBootstrap()
const workspaceStore = useWorkspaceStore()
const { activeLabel: workspaceActiveLabel } = storeToRefs(workspaceStore)
const workspaceNavStore = useWorkspaceNavigationStore()
const rightPanelView = ref<
  'chat' | 'settings' | 'monitor' | 'workspace' | 'workflows'
>('chat')
const sidebarCollapsed = ref(true)
const layoutEl = ref<HTMLElement | null>(null)
const providerSetupOpen = ref(false)
const chatPanelMounted = ref(false)
const signInGateOpen = ref(false)

const signInGateDescription = computed(() => t.value.signInGate.wizard)

function onOpenSetupWizard() {
  if (!isSignedIn.value) {
    signInGateOpen.value = true
    return
  }
  providerSetupOpen.value = true
}

function onOpenMonitor() {
  rightPanelView.value = 'monitor'
}

function onSignInGateSuccess() {
  signInGateOpen.value = false
  providerSetupOpen.value = true
}

function onOpenLocalLlmFromGate() {
  signInGateOpen.value = false
  sessionStorage.setItem('teralexi.settingsTab', 'llm')
  rightPanelView.value = 'settings'
}

function onProviderSetupFinished() {
  providerSetupOpen.value = false
}

watch(
  () => appUpdateState.phase,
  (phase, prev) => {
    if (phase === prev) return
    if (phase === 'downloaded') {
      toast.add({
        title: t.value.toast.updateAvailableTitle,
        description: t.value.titleBar.updateReady.replace(
          '{version}',
          appUpdateState.newVersion ? `v${appUpdateState.newVersion}` : 'v…',
        ),
        color: 'success',
      })
    }
  },
)

const SIDEBAR_COLLAPSED_WIDTH = 56
const sidebarResizeEnabled = computed(() => !sidebarCollapsed.value)

const {
  sizePx: sidebarWidthPx,
  isResizing: sidebarResizing,
  onResizePointerDown: onSidebarResizePointerDown,
  setSize: setSidebarWidth,
} = useHorizontalPanelResize({
  containerRef: layoutEl,
  panelSide: 'start',
  defaultSize: 256,
  minSize: 200,
  maxSize: { fraction: 0.42 },
  storageKey: 'teralexi.agent.sidebarWidth',
  enabled: sidebarResizeEnabled,
})

const sidebarStyle = computed(() => ({
  width: sidebarCollapsed.value
    ? `${SIDEBAR_COLLAPSED_WIDTH}px`
    : `${sidebarWidthPx.value}px`,
}))

function onSidebarKeyboardResize(delta: number) {
  setSidebarWidth(sidebarWidthPx.value + delta)
}

function toggleSidebarFromTitleBar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

watchEffect(() => {
  const isChatView = rightPanelView.value === 'chat'
  const shell = {
    visible: true,
    sidebarCollapsed: sidebarCollapsed.value,
    onToggleSidebar: toggleSidebarFromTitleBar,
    showChatActions: isChatView,
  }

  if (isChatView) {
    setTitleBarChatControls(shell)
    return
  }

  const panelTitles: Record<
    Exclude<typeof rightPanelView.value, 'chat'>,
    string
  > = {
    settings: t.value.settings.title,
    monitor: t.value.sidebar.tokenMonitor,
    workspace: workspaceActiveLabel.value || t.value.sidebar.workspace,
    workflows: t.value.sidebar.workflows,
  }

  setTitleBarChatControls({
    ...shell,
    title: panelTitles[rightPanelView.value],
    activeAgentName: '',
    activeAgentModel: '',
    showReportPanel: false,
    isBusy: false,
    onToggleReportPanel: null,
    onStop: null,
    onNewSession: null,
  })
})

watch(
  () => workspaceNavStore.openSplitPanel,
  (shouldOpen) => {
    if (shouldOpen) {
      rightPanelView.value = 'chat'
    }
  },
)

function stepTypeFromProgressChunk(
  chunk: Record<string, unknown>,
): string | null {
  const data =
    chunk['data'] && typeof chunk['data'] === 'object'
      ? (chunk['data'] as Record<string, unknown>)
      : {}
  const stepId = typeof data['stepId'] === 'string' ? data['stepId'].trim() : ''
  switch (stepId) {
    case 'thinking':
      return 'ThinkingStep'
    case 'planning':
      return 'PlanningStep'
    case 'toolLoop':
    case 'foreachItem':
      return 'SkillsToolExecutionStep'
    case 'summary':
      return 'SummaryStep'
    case 'report':
      return 'ReportStep'
    case 'createPaper':
      return 'CreatePaperStep'
    case 'search':
      return 'SearchStep'
    case 'webScrape':
      return 'WebScrapeStep'
    default:
      return null
  }
}

function encodeStructuredMarker(value: unknown): string {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function renderLiveStepProgress(chunk: Record<string, unknown>): string {
  const data =
    chunk['data'] && typeof chunk['data'] === 'object'
      ? (chunk['data'] as Record<string, unknown>)
      : {}
  const title =
    typeof data['title'] === 'string' && data['title'].trim()
      ? data['title'].trim()
      : 'Current step'
  const content = typeof data['content'] === 'string' ? data['content'] : ''
  const visible = content.trim()
    ? `- ${title}\n\n${content}`
    : `- ${title}\n\nWorking...`
  const stepType = stepTypeFromProgressChunk(chunk)
  if (!stepType) return visible

  const structured = {
    version: 2,
    assistantContent: {
      outer: {
        finalResult: '',
        report: '',
        streamingText: visible,
      },
      subSteps: [
        {
          type: stepType,
          title,
          content: content.trim() || 'Working...',
        },
      ],
    },
  }

  return `${visible}\n<!-- teralexi-structured:${encodeStructuredMarker(structured)} -->`
}

onMounted(() => {
  registerAppUpdateAboutHandler(() => {
    rightPanelView.value = 'settings'
  })
  void loadChatUiSettings()
  void loadAppLocale()

  /**
   * Pinia conversation rows back persistence, sidebar, and non-visible streams.
   * Live UI for the visible conversation is owned by Chat SDK (`IpcAgentChatTransport`).
   */
  initStoreStreamSync({
    getVisibleConversationId: () => agentStore.currentConversationId,
    getConversations: () => agentStore.conversations,
  })

  window.ipcRendererChannel?.ConversationStoreChanged?.on?.(
    async (
      _event,
      payload: {
        agentId: string
        conversationId: string
      },
    ) => {
      if (!payload?.agentId || !payload?.conversationId) return

      await agentStore.loadConversationList(payload.agentId)

      const bound = isBoundSessionId(payload.conversationId)
      const isCurrent =
        agentStore.currentConversationId === payload.conversationId

      if (
        isCurrent &&
        !agentStore.isConversationStreamActive(payload.conversationId)
      ) {
        await agentStore.selectConversation(payload.conversationId, true)
        runConversationStoreUiSync(payload.conversationId)
        return
      }

      if (bound && (!agentStore.currentConversationId || isCurrent)) {
        await agentStore.selectConversation(payload.conversationId, true)
        runConversationStoreUiSync(payload.conversationId)
        return
      }

      if (!agentStore.currentConversationId) {
        await agentStore.selectConversation(payload.conversationId)
      }

      runConversationStoreUiSync(payload.conversationId)
    },
  )

  window.ipcRendererChannel?.AgentStreamChunk?.on?.(
    (
      _event,
      payload: { conversationId: string; assistantId: string; chunk: string },
    ) => {
      const convMessages = agentStore.conversations[payload.conversationId]
      if (!convMessages) return
      const msg = convMessages.find((m) => m.id === payload.assistantId)
      if (!msg) return
      queueStoreTextDelta(payload.conversationId, payload.assistantId, payload.chunk)
    },
  )

  window.ipcRendererChannel?.AgentUIMessageChunk?.on?.(
    (
      _event,
      payload: {
        conversationId: string
        assistantId: string
        chunk: Record<string, unknown>
      },
    ) => {
      const convMessages = agentStore.conversations[payload.conversationId]
      if (!convMessages) return
      const msg = convMessages.find((m) => m.id === payload.assistantId)
      if (!msg) return
      if (payload.chunk?.type === 'data-agent-step-progress') {
        queueStoreStepProgress(
          payload.conversationId,
          payload.assistantId,
          renderLiveStepProgress(payload.chunk),
        )
        return
      }
      if (payload.chunk?.type !== 'text-delta') return
      const delta = payload.chunk.delta
      if (typeof delta !== 'string' || !delta) return
      queueStoreTextDelta(payload.conversationId, payload.assistantId, delta)
    },
  )

  window.ipcRendererChannel?.AgentStreamFinished?.on?.(
    (_event, payload: { conversationId: string; assistantId: string }) => {
      const chat = getConversationChat(payload.conversationId)
      const uiMsg = chat?.messages.find((m) => m.id === payload.assistantId)
      if (uiMsg?.role === 'assistant') {
        syncStoreAssistantFromUiMessage(
          payload.conversationId,
          payload.assistantId,
          uiMsg.parts,
        )
      } else {
        flushStoreStreamSync()
      }
      agentStore.markAssistantMessageFinished(
        payload.conversationId,
        payload.assistantId,
      )
    },
  )

  window.ipcRendererChannel?.OpenSandboxPreview?.on?.(
    (_event, payload: { fileUrl: string }) => {
      const fileUrl = payload?.fileUrl?.trim()
      if (!fileUrl) return
      rightPanelView.value = 'chat'
      requestSandboxPreview(fileUrl)
    },
  )

  watch(
    () => agentStore.currentConversationId,
    (id) => {
      flushStoreStreamSync()
      void workspaceStore.loadForConversation(id)
    },
  )

  void bootstrapAgentChat()
})

function openProviderSetupWizardIfNeeded() {
  if (sessionStorage.getItem(PROVIDER_SETUP_SESSION_KEY) === '1') {
    sessionStorage.removeItem(PROVIDER_SETUP_SESSION_KEY)
    if (isSignedIn.value) {
      providerSetupOpen.value = true
    }
  } else if (agentStore.shouldShowProviderSetupWizard && isSignedIn.value) {
    providerSetupOpen.value = true
  }
}

async function bootstrapAgentChat() {
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
  chatPanelMounted.value = true
  void runStartupBootstrap(openProviderSetupWizardIfNeeded)
}

onUnmounted(() => {
  registerAppUpdateAboutHandler(null)
  resetTitleBarChatControls()
  window.ipcRendererChannel?.ConversationStoreChanged?.removeAllListeners?.()
  window.ipcRendererChannel?.AgentStreamChunk?.removeAllListeners?.()
  window.ipcRendererChannel?.AgentUIMessageChunk?.removeAllListeners?.()
  window.ipcRendererChannel?.AgentStreamFinished?.removeAllListeners?.()
  window.ipcRendererChannel?.OpenSandboxPreview?.removeAllListeners?.()
})
</script>

<style scoped>
.agent-app {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}
.agent-layout {
  display: flex;
  height: 100%;
  background: var(--ui-bg);
  /* Align sidebar brand strip with main panel headers (chat / settings). */
  --agent-header-min-height: 64px;
  --agent-header-padding-y: 10px;
  --agent-header-padding-x: 20px;
}

/* ── Sidebar ── */
.sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-elevated);
  border-right: 1px solid var(--ui-border);
  overflow: hidden;
  position: relative;
  z-index: 2;
}
.agent-layout--resizing {
  cursor: col-resize;
  user-select: none;
}
.agent-layout--resizing .right-panel {
  pointer-events: none;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--agent-header-min-height);
  padding: var(--agent-header-padding-y) var(--agent-header-padding-x);
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-border);
  position: relative;
}
.sidebar-collapsed .sidebar-brand {
  justify-content: center;
}
.sidebar-collapsed .brand-name {
  display: none;
}
.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--ui-text);
  letter-spacing: -0.3px;
}

/* ── Right panel ── */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ui-bg);
}
.right-panel-boot-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ui-text-muted);
  font-size: 13px;
}
.right-panel-boot-loading__icon {
  width: 22px;
  height: 22px;
  animation: right-panel-boot-spin 0.9s linear infinite;
}
@keyframes right-panel-boot-spin {
  to {
    transform: rotate(360deg);
  }
}

.sign-in-gate-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: blur(4px);
}

.sign-in-gate-modal {
  position: relative;
  width: min(480px, 100%);
}

.sign-in-gate-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 14px;
}

.sign-in-gate-close:hover {
  background: var(--ui-bg-accented);
  color: var(--ui-text);
}
</style>
