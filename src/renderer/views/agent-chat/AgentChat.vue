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
          <div class="brand-logo"><openfdeLogo /></div>
          <span class="brand-name">{{ t.app.name }}</span>
        </div>
        <AgentList
          :collapsed="sidebarCollapsed"
          @navigate-chat="rightPanelView = 'chat'"
        />
        <SidebarFooter
          :right-panel-view="rightPanelView"
          @toggle-settings="
            rightPanelView = rightPanelView === 'settings' ? 'chat' : 'settings'
          "
          @open-monitor="rightPanelView = 'monitor'"
          @open-workspace="
            rightPanelView = rightPanelView === 'workspace' ? 'chat' : 'workspace'
          "
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
          v-else
          :sidebar-collapsed="sidebarCollapsed"
          @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
        />
      </main>
    </div>

    <ProviderSetupWizard
      :open="providerSetupOpen"
      @close="providerSetupOpen = false"
      @finished="onProviderSetupFinished"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, watchEffect } from 'vue'
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
import openfdeLogo from './components/openfdeLogo.vue'
import AgentList from './components/AgentList.vue'
import SidebarFooter from './components/SidebarFooter.vue'
import ChatPanel from './components/ChatPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import MonitorPanel from './components/MonitorPanel.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import WorkflowPanel from '@renderer/views/workflows/WorkflowPanel.vue'
import {
  bindAppUpdateListeners,
  useAppUpdate,
} from '@renderer/composables/useAppUpdate'
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
import ProviderSetupWizard from './components/ProviderSetupWizard.vue'
import { PROVIDER_SETUP_SESSION_KEY } from '@renderer/lib/provider-setup-session'

const { t } = useI18n()

const toast = useToast()
const { state: appUpdateState } = useAppUpdate()

const agentStore = useAgentStore()
const workspaceStore = useWorkspaceStore()
const { activeLabel: workspaceActiveLabel } = storeToRefs(workspaceStore)
const workspaceNavStore = useWorkspaceNavigationStore()
const rightPanelView = ref<
  'chat' | 'settings' | 'monitor' | 'workspace' | 'workflows'
>('chat')
const sidebarCollapsed = ref(true)
const layoutEl = ref<HTMLElement | null>(null)
const providerSetupOpen = ref(false)
let unbindAppUpdate: (() => void) | null = null

function onProviderSetupFinished() {
  providerSetupOpen.value = false
}

watch(
  () => appUpdateState.phase,
  (phase, prev) => {
    if (phase === prev) return
    if (phase === 'available' && appUpdateState.newVersion) {
      toast.add({
        title: t.value.toast.updateAvailableTitle,
        description: t.value.toast.updateAvailableDescription.replace(
          '{version}',
          appUpdateState.newVersion,
        ),
        color: 'primary',
      })
    }
    if (phase === 'downloaded') {
      toast.add({
        title: 'Update ready',
        description:
          'Restart OpenFDE to install the update. Open Settings → About.',
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
  storageKey: 'openfde.agent.sidebarWidth',
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

  return `${visible}\n<!-- otter-structured:${encodeStructuredMarker(structured)} -->`
}

onMounted(async () => {
  unbindAppUpdate = bindAppUpdateListeners()
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

  await workspaceStore.loadForConversation(agentStore.currentConversationId)
  watch(
    () => agentStore.currentConversationId,
    (id) => {
      flushStoreStreamSync()
      void workspaceStore.loadForConversation(id)
    },
  )
  await agentStore.initializeSettingsFromConfig()
  await Promise.all(
    agentStore.enabledAgents.map((agent) =>
      agentStore.loadConversationList(agent.id),
    ),
  )
  await agentStore.checkConnection()
  await agentStore.fetchModelsForProvider('ollama')
  if (
    agentStore.shouldShowProviderSetupWizard ||
    sessionStorage.getItem(PROVIDER_SETUP_SESSION_KEY) === '1'
  ) {
    sessionStorage.removeItem(PROVIDER_SETUP_SESSION_KEY)
    providerSetupOpen.value = true
  }
})

onUnmounted(() => {
  unbindAppUpdate?.()
  resetTitleBarChatControls()
  window.ipcRendererChannel?.ConversationStoreChanged?.removeAllListeners?.()
  window.ipcRendererChannel?.AgentStreamChunk?.removeAllListeners?.()
  window.ipcRendererChannel?.AgentUIMessageChunk?.removeAllListeners?.()
  window.ipcRendererChannel?.AgentStreamFinished?.removeAllListeners?.()
})
</script>

<style scoped>
.agent-app {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
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
</style>
