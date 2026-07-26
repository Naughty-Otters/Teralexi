<template>
  <div class="chat-panel">
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

      <ConversationSplitLayout
        v-if="layoutRoot && layoutFocusedPaneId"
        :node="layoutRoot"
        :focused-pane-id="layoutFocusedPaneId"
        @focus-pane="onFocusPane"
        @update-ratio="onUpdateRatio"
      >
        <template #pane="{ paneId, conversationId, isFocused }">
          <ChatPaneView
            :key="paneId"
            :conversation-id="conversationId"
            :is-focused="isFocused"
            @activate="onFocusPane(paneId)"
            @open-preview="openSandboxPreview"
          />
        </template>
      </ConversationSplitLayout>

      <div
        v-else
        class="chat-panel__empty"
        role="status"
      >
        {{ t.common.loading }}
      </div>

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
        @add-link-tab="onAddPreviewLinkTab"
        @update-link-tab-url="onUpdatePreviewLinkTabUrl"
        @open-preview-url="openSandboxPreview"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  watch,
  watchEffect,
  ref,
  onMounted,
  onUnmounted,
} from 'vue'
import { storeToRefs } from 'pinia'
import { useAgentStore, type Conversation } from '@store/agent'
import { useWorkspaceNavigationStore } from '@store/workspace-navigation'
import { useConversationLayoutStore } from '@store/conversation-layout'
import { setTitleBarChatControls } from '@renderer/composables/useTitleBarChatControls'
import {
  LAYOUT_PREF_KEYS,
  useLayoutPreference,
} from '@renderer/lib/layout-preferences'
import { useHorizontalPanelResize } from '@renderer/composables/useHorizontalPanelResize'
import { SPLIT_PANEL_PEER_MIN_PX } from '@renderer/composables/useHorizontalPanelResize'
import PanelResizeHandle from '@renderer/components/PanelResizeHandle.vue'
import { useI18n } from '@renderer/composables/useI18n'
import { getConversationChat } from '../conversation-chat-session'
import {
  setVisibleConversationIdsForUiFlush,
} from '../perf/scheduleUiFlush'
import { bindSandboxPreviewRequest } from '../sandboxPreviewBridge'
import {
  closePreviewLinkTab,
  createEmptyPreviewLinkTab,
  openPreviewLinkTab,
  updatePreviewLinkTabUrl,
  type PreviewLinkTab,
} from '../report-preview-tabs'
import type { ReportPanelPreviewSource } from './ReportPanel.vue'
import ConversationSplitLayout from './ConversationSplitLayout.vue'
import ChatPaneView from './ChatPaneView.vue'
import { buildPaneConversationOptions } from '../paneConversationOptions'

const ReportPanel = defineAsyncComponent(() => import('./ReportPanel.vue'))
const WorkspacePanel = defineAsyncComponent(() => import('./WorkspacePanel.vue'))

const props = defineProps<{ sidebarCollapsed: boolean }>()
const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const { t } = useI18n()
const agentStore = useAgentStore()
const workspaceNavStore = useWorkspaceNavigationStore()
const layoutStore = useConversationLayoutStore()
const {
  root: layoutRoot,
  focusedPaneId: layoutFocusedPaneId,
  canSplit,
  canCloseFocused,
  visibleConversationIdList,
  focusedConversationId: layoutFocusedConversationId,
} = storeToRefs(layoutStore)

const chatBodyEl = ref<HTMLElement | null>(null)

const showReportPanel = useLayoutPreference(
  LAYOUT_PREF_KEYS.reportPanelOpen,
  false,
)
const showWorkspaceSplitPanel = computed({
  get: () =>
    workspaceNavStore.isWorkspacePanelOpen(agentStore.currentConversationId),
  set: (open: boolean) => {
    const conversationId = agentStore.currentConversationId?.trim()
    if (!conversationId) return
    workspaceNavStore.setWorkspacePanelOpen(conversationId, open)
  },
})

const previewLinkTabsByConversation = ref<Record<string, PreviewLinkTab[]>>({})
const activePreviewLinkTabIdByConversation = ref<Record<string, string | null>>(
  {},
)
const previewPanelSourceByConversation = ref<
  Record<string, ReportPanelPreviewSource>
>({})

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
  minSize: SPLIT_PANEL_PEER_MIN_PX,
  maxSize: { fraction: 1, reservePx: SPLIT_PANEL_PEER_MIN_PX },
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
  minSize: SPLIT_PANEL_PEER_MIN_PX,
  maxSize: { fraction: 1, reservePx: SPLIT_PANEL_PEER_MIN_PX },
  storageKey: 'teralexi.agent.workspaceSplitPanelWidth',
  enabled: workspaceSplitPanelResizeEnabled,
})

function onReportPanelKeyboardResize(delta: number) {
  setReportPanelWidth(reportPanelWidthPx.value + delta)
}

function onWorkspaceSplitPanelKeyboardResize(delta: number) {
  setWorkspaceSplitPanelWidth(workspaceSplitPanelWidthPx.value + delta)
}

watch(workspaceSplitPanelResizeEnabled, (enabled) => {
  if (enabled) setWorkspaceSplitPanelWidth(workspaceSplitPanelWidthPx.value)
})

watch(reportPanelResizeEnabled, (enabled) => {
  if (enabled) setReportPanelWidth(reportPanelWidthPx.value)
})

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

function onAddPreviewLinkTab() {
  const cid = agentStore.currentConversationId?.trim()
  if (!cid) return
  const prevTabs = previewLinkTabsByConversation.value[cid] ?? []
  const { tabs, activeTabId } = createEmptyPreviewLinkTab(prevTabs)
  setConversationPreviewTabs(cid, tabs, activeTabId)
  previewPanelSourceByConversation.value = {
    ...previewPanelSourceByConversation.value,
    [cid]: 'link',
  }
}

function onUpdatePreviewLinkTabUrl(payload: { tabId: string; url: string }) {
  const cid = agentStore.currentConversationId?.trim()
  if (!cid) return
  const prevTabs = previewLinkTabsByConversation.value[cid] ?? []
  const tabs = updatePreviewLinkTabUrl(prevTabs, payload.tabId, payload.url)
  const activeId = activePreviewLinkTabIdByConversation.value[cid] ?? null
  setConversationPreviewTabs(cid, tabs, activeId)
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

const activeAgentName = computed(
  () => agentStore.selectedAgent?.name?.trim() || 'Agent',
)
const activeAgentModel = computed(() => {
  const agent = agentStore.selectedAgent
  if (!agent) return ''
  return agent.model?.trim() || ''
})

const isBusy = computed(() => {
  const cid = agentStore.currentConversationId?.trim()
  if (!cid) return false
  return agentStore.isConversationStreamActive(cid)
})

async function onFocusPane(paneId: string) {
  if (!layoutStore.focusPane(paneId)) return
  const conversationId = layoutStore.focusedConversationId
  if (!conversationId) return
  if (agentStore.currentConversationId !== conversationId) {
    await agentStore.selectConversation(conversationId)
  }
}

function onUpdateRatio(path: number[], ratio: number) {
  layoutStore.updateGroupRatio(path, ratio)
}

function syncVisibleUiFlush() {
  setVisibleConversationIdsForUiFlush(
    visibleConversationIdList.value,
    layoutFocusedConversationId.value ?? agentStore.currentConversationId,
  )
}

watch(
  [visibleConversationIdList, layoutFocusedConversationId],
  () => {
    syncVisibleUiFlush()
  },
  { immediate: true, deep: true },
)

watch(
  () => agentStore.currentConversationId,
  (conversationId) => {
    if (!conversationId) return
    if (!layoutStore.root) {
      layoutStore.ensureLayout(conversationId)
      return
    }
    if (layoutStore.focusedConversationId !== conversationId) {
      if (!layoutStore.focusPaneForConversation(conversationId)) {
        layoutStore.openConversation(conversationId)
      }
    }
  },
)

function toggleSidebar() {
  emit('toggle-sidebar')
}

function toggleReportPanel() {
  showReportPanel.value = !showReportPanel.value
}

function onStop() {
  const conversationId = agentStore.currentConversationId?.trim()
  if (!conversationId) return
  agentStore.markUiChatInFlight(conversationId, false)
  const chat = getConversationChat(conversationId)
  void chat?.stop()
  void window.ipcRendererChannel?.StopAgentForConversation?.invoke?.({
    conversationId,
  })
}

async function startNewSessionFromTitleBar() {
  const conv = await agentStore.createNewConversation(undefined, {
    mode: 'replicate-current',
  })
  if (!conv) return
  layoutStore.openConversation(conv.id)
  await agentStore.selectConversation(conv.id)
}

async function splitPane(direction: 'right' | 'down') {
  if (!canSplit.value) return
  const conv = await agentStore.createNewConversation(undefined, {
    mode: 'replicate-current',
    select: false,
  })
  if (!conv) return
  const newPaneId = layoutStore.splitFocused(direction, conv.id)
  if (!newPaneId) return
  await agentStore.selectConversation(conv.id)
}

async function closeFocusedPane() {
  if (!canCloseFocused.value) return
  const nextPaneId = layoutStore.closeFocusedPane()
  if (!nextPaneId) return
  const nextConv = layoutStore.focusedConversationId
  if (nextConv) await agentStore.selectConversation(nextConv)
}

const paneConversationOptions = computed(() =>
  buildPaneConversationOptions({
    conversations: Object.values(agentStore.uiConversationList).flat(),
    openConversationIds: visibleConversationIdList.value,
    currentConversationId: agentStore.currentConversationId,
  }),
)

async function onSelectPaneConversation(conversationId: string) {
  const id = conversationId.trim()
  if (!id || id === agentStore.currentConversationId) return
  layoutStore.openConversation(id)
  await agentStore.selectConversation(id)
}

watchEffect(() => {
  setTitleBarChatControls({
    visible: true,
    title: headerTitle.value,
    activeAgentName: activeAgentName.value,
    activeAgentModel: activeAgentModel.value,
    sidebarCollapsed: props.sidebarCollapsed,
    showChatActions: true,
    showWorkspacePanel: showWorkspaceSplitPanel.value,
    showReportPanel: showReportPanel.value,
    isBusy: isBusy.value,
    canSplitPane: canSplit.value,
    canClosePane: canCloseFocused.value,
    conversationId: agentStore.currentConversationId,
    conversationOptions: paneConversationOptions.value,
    onToggleSidebar: toggleSidebar,
    onToggleReportPanel: toggleReportPanel,
    onStop,
    onNewSession: startNewSessionFromTitleBar,
    onSplitRight: () => {
      void splitPane('right')
    },
    onSplitDown: () => {
      void splitPane('down')
    },
    onClosePane: () => {
      void closeFocusedPane()
    },
    onSelectConversation: (conversationId: string) => {
      void onSelectPaneConversation(conversationId)
    },
  })
})

let stopSandboxPreviewRequestWatch: (() => void) | null = null
let onSandboxOutput: ((...args: unknown[]) => void) | null = null

onMounted(() => {
  stopSandboxPreviewRequestWatch = bindSandboxPreviewRequest(openSandboxPreview)
  onSandboxOutput = (_e: unknown, payload: unknown) => {
    agentStore.recordSandboxOutput(payload as never)
  }
  window.ipcRendererChannel?.AgentSandboxOutput?.on?.(onSandboxOutput)
  const cid = agentStore.currentConversationId?.trim()
  if (cid && !layoutStore.root) {
    layoutStore.ensureLayout(cid)
  }
  syncVisibleUiFlush()
})

onUnmounted(() => {
  stopSandboxPreviewRequestWatch?.()
  stopSandboxPreviewRequestWatch = null
  if (onSandboxOutput) {
    window.ipcRendererChannel?.AgentSandboxOutput?.removeListener?.(
      onSandboxOutput,
    )
    onSandboxOutput = null
  }
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
.chat-body--resizing :deep(.chat-main) {
  pointer-events: none;
}
.chat-panel__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: 13px;
}
</style>
