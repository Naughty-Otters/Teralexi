import { reactive } from 'vue'

type TitleBarChatAction = (() => void) | null

export type TitleBarChatControlsState = {
  visible: boolean
  title: string
  activeAgentName: string
  activeAgentModel: string
  sidebarCollapsed: boolean
  showChatActions: boolean
  showWorkspacePanel: boolean
  showReportPanel: boolean
  isBusy: boolean
  onToggleSidebar: TitleBarChatAction
  onToggleWorkspacePanel: TitleBarChatAction
  onToggleReportPanel: TitleBarChatAction
  onStop: TitleBarChatAction
  onNewSession: TitleBarChatAction
}

function createDefaultState(): TitleBarChatControlsState {
  return {
    visible: false,
    title: '',
    activeAgentName: '',
    activeAgentModel: '',
    sidebarCollapsed: true,
    showChatActions: false,
    showWorkspacePanel: false,
    showReportPanel: false,
    isBusy: false,
    onToggleSidebar: null,
    onToggleWorkspacePanel: null,
    onToggleReportPanel: null,
    onStop: null,
    onNewSession: null,
  }
}

const titleBarChatControls = reactive<TitleBarChatControlsState>(createDefaultState())

export function useTitleBarChatControls(): TitleBarChatControlsState {
  return titleBarChatControls
}

export function setTitleBarChatControls(
  nextState: Partial<TitleBarChatControlsState>,
): void {
  Object.assign(titleBarChatControls, nextState)
}

export function resetTitleBarChatControls(): void {
  Object.assign(titleBarChatControls, createDefaultState())
}
