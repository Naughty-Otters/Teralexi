import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearTitleBarViewActions,
  resetTitleBarChatControls,
  setTitleBarShellControls,
  setTitleBarViewActions,
  useTitleBarChatControls,
  type TitleBarViewAction,
} from './useTitleBarChatControls'

describe('useTitleBarChatControls', () => {
  afterEach(() => {
    resetTitleBarChatControls()
  })

  it('setTitleBarShellControls does not touch viewActions', () => {
    const actions: TitleBarViewAction[] = [
      {
        id: 'stop',
        icon: 'i-lucide-square',
        tooltip: 'Stop',
        onClick: vi.fn(),
      },
    ]
    setTitleBarViewActions(actions)

    setTitleBarShellControls({
      visible: true,
      title: 'Hello',
      sidebarCollapsed: false,
    })

    const state = useTitleBarChatControls()
    expect(state.shell.visible).toBe(true)
    expect(state.shell.title).toBe('Hello')
    expect(state.shell.sidebarCollapsed).toBe(false)
    expect(state.viewActions).toEqual(actions)
  })

  it('setTitleBarViewActions replaces the whole list', () => {
    setTitleBarViewActions([
      {
        id: 'a',
        icon: 'i-lucide-a',
        tooltip: 'A',
        onClick: vi.fn(),
      },
    ])
    const next: TitleBarViewAction[] = [
      {
        id: 'b',
        icon: 'i-lucide-b',
        tooltip: 'B',
        onClick: vi.fn(),
      },
      {
        id: 'c',
        kind: 'menu',
        icon: 'i-lucide-history',
        tooltip: 'Menu',
        options: [{ id: '1', label: 'One' }],
        selectedId: '1',
        onSelect: vi.fn(),
      },
    ]
    setTitleBarViewActions(next)

    expect(useTitleBarChatControls().viewActions).toEqual(next)
    expect(useTitleBarChatControls().viewActions).toHaveLength(2)
  })

  it('clearTitleBarViewActions empties the list without resetting shell', () => {
    setTitleBarShellControls({ visible: true, title: 'Keep me' })
    setTitleBarViewActions([
      {
        id: 'stop',
        icon: 'i-lucide-square',
        tooltip: 'Stop',
        onClick: vi.fn(),
      },
    ])

    clearTitleBarViewActions()

    const state = useTitleBarChatControls()
    expect(state.viewActions).toEqual([])
    expect(state.shell.visible).toBe(true)
    expect(state.shell.title).toBe('Keep me')
  })

  it('resetTitleBarChatControls clears shell and view actions', () => {
    setTitleBarShellControls({
      visible: true,
      title: 'Chat',
      activeAgentName: 'Agent',
      isBusy: true,
      sidebarCollapsed: false,
      showWorkspacePanel: true,
      onToggleSidebar: vi.fn(),
    })
    setTitleBarViewActions([
      {
        id: 'stop',
        icon: 'i-lucide-square',
        tooltip: 'Stop',
        onClick: vi.fn(),
      },
    ])

    resetTitleBarChatControls()

    const state = useTitleBarChatControls()
    expect(state.shell).toEqual({
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
    })
    expect(state.viewActions).toEqual([])
  })
})
