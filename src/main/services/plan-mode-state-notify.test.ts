import { describe, expect, it, vi, beforeEach } from 'vitest'

const { planModeStateChanged, getAllWindows } = vi.hoisted(() => ({
  planModeStateChanged: vi.fn(),
  getAllWindows: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows,
  },
}))

vi.mock('./web-content-send', () => ({
  webContentSend: {
    PlanModeStateChanged: planModeStateChanged,
  },
}))

import { notifyPlanModeStateChanged } from './plan-mode-state-notify'

describe('notifyPlanModeStateChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('broadcasts plan mode view to all live windows', () => {
    const webContents = { id: 1 }
    getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents },
      { isDestroyed: () => true, webContents: { id: 2 } },
    ])

    const view = { status: 'planning' as const, planSlug: 'auth' }
    notifyPlanModeStateChanged('conv-1', view)

    expect(planModeStateChanged).toHaveBeenCalledTimes(1)
    expect(planModeStateChanged).toHaveBeenCalledWith(webContents, {
      conversationId: 'conv-1',
      view,
    })
  })

  it('ignores blank conversation ids', () => {
    getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: {} },
    ])
    notifyPlanModeStateChanged('  ', {
      status: 'tool_execute',
      planSlug: null,
    })
    expect(planModeStateChanged).not.toHaveBeenCalled()
  })
})
