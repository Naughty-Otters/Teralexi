import { reactive } from 'vue'

type TitleBarChatAction = (() => void) | null

export type TitleBarConversationOption = {
  id: string
  label: string
}

export type TitleBarViewButtonAction = {
  id: string
  kind?: 'button'
  icon: string
  tooltip: string
  ariaLabel?: string
  disabled?: boolean
  active?: boolean
  accent?: boolean
  group?: 'session'
  onClick: () => void
}

export type TitleBarViewMenuAction = {
  id: string
  kind: 'menu'
  icon: string
  tooltip: string
  ariaLabel?: string
  disabled?: boolean
  group?: 'session'
  options: TitleBarConversationOption[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export type TitleBarViewAction = TitleBarViewButtonAction | TitleBarViewMenuAction

export type TitleBarShellControlsState = {
  visible: boolean
  title: string
  activeAgentName: string
  activeAgentModel: string
  isBusy: boolean
  sidebarCollapsed: boolean
  showWorkspacePanel: boolean
  showReportPanel: boolean
  onToggleSidebar: TitleBarChatAction
  onToggleWorkspacePanel: TitleBarChatAction
  onToggleReportPanel: TitleBarChatAction
}

export type TitleBarChatControlsState = {
  shell: TitleBarShellControlsState
  viewActions: TitleBarViewAction[]
}

function createDefaultShell(): TitleBarShellControlsState {
  return {
    visible: false,
    title: '',
    activeAgentName: '',
    activeAgentModel: '',
    isBusy: false,
    sidebarCollapsed: true,
    showWorkspacePanel: false,
    showReportPanel: false,
    onToggleSidebar: null,
    onToggleWorkspacePanel: null,
    onToggleReportPanel: null,
  }
}

function createDefaultState(): TitleBarChatControlsState {
  return {
    shell: createDefaultShell(),
    viewActions: [],
  }
}

const titleBarChatControls = reactive<TitleBarChatControlsState>(createDefaultState())

export function useTitleBarChatControls(): TitleBarChatControlsState {
  return titleBarChatControls
}

export function setTitleBarShellControls(
  nextState: Partial<TitleBarShellControlsState>,
): void {
  Object.assign(titleBarChatControls.shell, nextState)
}

export function setTitleBarViewActions(actions: TitleBarViewAction[]): void {
  titleBarChatControls.viewActions = actions
}

export function clearTitleBarViewActions(): void {
  titleBarChatControls.viewActions = []
}

export function resetTitleBarChatControls(): void {
  Object.assign(titleBarChatControls.shell, createDefaultShell())
  titleBarChatControls.viewActions = []
}
