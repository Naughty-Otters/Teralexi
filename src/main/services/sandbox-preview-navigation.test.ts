import { describe, expect, it, vi, beforeEach } from 'vitest'

const { openSandboxPreview } = vi.hoisted(() => ({
  openSandboxPreview: vi.fn(),
}))

vi.mock('./web-content-send', () => ({
  webContentSend: {
    OpenSandboxPreview: openSandboxPreview,
  },
}))

import { attachSandboxPreviewNavigation } from './sandbox-preview-navigation'

describe('attachSandboxPreviewNavigation', () => {
  const appShellUrl = 'http://localhost:5173/'
  let willNavigateHandler: (event: { preventDefault: () => void }, url: string) => void
  let windowOpenHandler: (details: { url: string }) => { action: 'allow' | 'deny' }

  beforeEach(() => {
    vi.clearAllMocks()
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const webContents = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler)
      }),
      setWindowOpenHandler: vi.fn((handler: typeof windowOpenHandler) => {
        windowOpenHandler = handler
      }),
    } as unknown as Electron.WebContents

    attachSandboxPreviewNavigation(webContents, appShellUrl)
    willNavigateHandler = handlers.get('will-navigate') as typeof willNavigateHandler
  })

  it('opens sandbox preview instead of navigating to file urls', () => {
    const preventDefault = vi.fn()
    const fileUrl = 'file:///tmp/sandbox/output/report.html'

    willNavigateHandler({ preventDefault }, fileUrl)

    expect(preventDefault).toHaveBeenCalled()
    expect(openSandboxPreview).toHaveBeenCalledWith(expect.anything(), {
      fileUrl,
    })
  })

  it('allows normal app shell navigation', () => {
    const preventDefault = vi.fn()

    willNavigateHandler({ preventDefault }, 'http://localhost:5173/#/chat')

    expect(preventDefault).not.toHaveBeenCalled()
    expect(openSandboxPreview).not.toHaveBeenCalled()
  })

  it('denies window.open for sandbox file urls', () => {
    const fileUrl = 'file:///tmp/sandbox/output/report.html'
    const result = windowOpenHandler({ url: fileUrl })

    expect(result).toEqual({ action: 'deny' })
    expect(openSandboxPreview).toHaveBeenCalledWith(expect.anything(), {
      fileUrl,
    })
  })

  it('allows window.open for non-preview urls', () => {
    expect(windowOpenHandler({ url: 'https://example.com' })).toEqual({
      action: 'allow',
    })
    expect(openSandboxPreview).not.toHaveBeenCalled()
  })
})
