import { describe, expect, it, vi } from 'vitest'

const {
  addChildView,
  removeChildView,
  WebContentsView,
  readFile,
  writeFile,
  mkdir,
  stat,
} = vi.hoisted(() => {
  const addChildView = vi.fn()
  const removeChildView = vi.fn()
  const readFile = vi.fn()
  const writeFile = vi.fn()
  const mkdir = vi.fn()
  const stat = vi.fn()
  const WebContentsView = vi.fn().mockImplementation(function WebContentsViewMock() {
    return {
      setBackgroundColor: vi.fn(),
      setBounds: vi.fn(),
      webContents: {
        isDestroyed: () => false,
        getURL: () => '',
        loadURL: vi.fn(),
        loadFile: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
      },
    }
  })
  return {
    addChildView,
    removeChildView,
    WebContentsView,
    readFile,
    writeFile,
    mkdir,
    stat,
  }
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

vi.mock('fs/promises', () => ({
  default: {
    readFile,
    writeFile,
    mkdir,
    stat,
  },
}))

vi.mock('./result-document-html', () => ({
  renderMarkdownToHtmlDocument: (body: string) =>
    `<html><body>${body}</body></html>`,
  renderMarkdownSourceHtmlDocument: (body: string) =>
    `<html><pre>${body}</pre></html>`,
}))

import { syncSandboxOutputView } from './output-view'

describe('syncSandboxOutputView', () => {
  beforeEach(async () => {
    WebContentsView.mockClear()
    readFile.mockClear()
    writeFile.mockClear()
    mkdir.mockClear()
    stat.mockClear()
    stat.mockResolvedValue({ mtimeMs: 1, size: 100 })
    addChildView.mockClear()
    removeChildView.mockClear()
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 0, y: 0, width: 100, height: 100 },
      fileUrl: null,
    })
  })

  it('no-ops remove when no overlay exists', async () => {
    await expect(
      syncSandboxOutputView({ sender: {} } as never, {
        screenBounds: { x: 0, y: 0, width: 100, height: 100 },
        fileUrl: null,
      }),
    ).resolves.toBeUndefined()
  })

  it('creates view and loads file url', async () => {
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: 'file:///tmp/results',
    })
    expect(WebContentsView).toHaveBeenCalled()
    expect(addChildView).toHaveBeenCalled()
  })

  it('renders markdown files as html via temp file', async () => {
    readFile.mockResolvedValue('# Title\n\nBody')
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: 'file:///tmp/output/results/paper.md',
      markdownView: 'html',
    })
    const view = WebContentsView.mock.results.at(-1)?.value
    expect(readFile).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalled()
    expect(view.webContents.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.html$/),
    )
    expect(view.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('shows markdown source in html when raw mode is requested', async () => {
    readFile.mockResolvedValue('# Title\n\nBody')
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: 'file:///tmp/output/results/paper.md',
      markdownView: 'raw',
    })
    const view = WebContentsView.mock.results.at(-1)?.value
    expect(readFile).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.html$/),
      '<html><pre># Title\n\nBody</pre></html>',
      'utf8',
    )
    expect(view.webContents.loadFile).toHaveBeenCalled()
    expect(view.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('serializes rapid markdown mode toggles without surfacing abort errors', async () => {
    readFile.mockResolvedValue('# Title')
    let loadAttempt = 0
    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return {
        setBackgroundColor: vi.fn(),
        setBounds: vi.fn(),
        webContents: {
          isDestroyed: () => false,
          getURL: () => '',
          loadURL: vi.fn(),
          loadFile: vi.fn().mockImplementation(async () => {
            loadAttempt++
            if (loadAttempt === 1) {
              throw new Error(
                "ERR_ABORTED (-3) loading 'file:///tmp/openfde-sandbox-preview/a.html'",
              )
            }
          }),
          on: vi.fn(),
          close: vi.fn(),
        },
      }
    })

    await expect(
      Promise.all([
        syncSandboxOutputView({ sender: {} } as never, {
          screenBounds: { x: 10, y: 20, width: 300, height: 200 },
          fileUrl: 'file:///tmp/output/results/paper.md',
          markdownView: 'html',
        }),
        syncSandboxOutputView({ sender: {} } as never, {
          screenBounds: { x: 10, y: 20, width: 300, height: 200 },
          fileUrl: 'file:///tmp/output/results/paper.md',
          markdownView: 'raw',
        }),
      ]),
    ).resolves.toBeDefined()
    expect(loadAttempt).toBeGreaterThanOrEqual(2)
  })
})
