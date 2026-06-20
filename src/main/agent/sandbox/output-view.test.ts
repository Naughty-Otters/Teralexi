import { describe, expect, it, vi } from 'vitest'

const { addChildView, removeChildView, WebContentsView } = vi.hoisted(() => {
  const addChildView = vi.fn()
  const removeChildView = vi.fn()
  const WebContentsView = vi.fn().mockImplementation(function WebContentsViewMock() {
    return {
      setBackgroundColor: vi.fn(),
      setBounds: vi.fn(),
      webContents: {
        isDestroyed: () => false,
        getURL: () => '',
        loadURL: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      },
    }
  })
  return { addChildView, removeChildView, WebContentsView }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({
      id: 1,
      isDestroyed: () => false,
      once: vi.fn(),
      getContentBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      contentView: { addChildView, removeChildView },
    })),
  },
  WebContentsView,
}))

import { syncSandboxOutputView } from './output-view'

describe('syncSandboxOutputView', () => {
  it('no-ops remove when no overlay exists', () => {
    expect(() =>
      syncSandboxOutputView({ sender: {} } as never, {
        screenBounds: { x: 0, y: 0, width: 100, height: 100 },
        fileUrl: null,
      }),
    ).not.toThrow()
  })

  it('creates view and loads file url', () => {
    syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: 'file:///tmp/results',
    })
    expect(WebContentsView).toHaveBeenCalled()
    expect(addChildView).toHaveBeenCalled()
  })
})
