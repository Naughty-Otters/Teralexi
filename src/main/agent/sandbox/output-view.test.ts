import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  addChildView,
  removeChildView,
  WebContentsView,
  readFile,
  writeFile,
  mkdir,
  stat,
  createWebContentsViewMock,
} = vi.hoisted(() => {
  const addChildView = vi.fn()
  const removeChildView = vi.fn()
  const readFile = vi.fn()
  const writeFile = vi.fn()
  const mkdir = vi.fn()
  const stat = vi.fn()

  function createWebContentsViewMock(overrides?: {
    loadFile?: ReturnType<typeof vi.fn>
  }) {
    return {
      setBackgroundColor: vi.fn(),
      setBounds: vi.fn(),
      webContents: {
        isDestroyed: () => false,
        getURL: () => '',
        loadURL: vi.fn(),
        loadFile: overrides?.loadFile ?? vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
        navigationHistory: {
          canGoBack: () => false,
          canGoForward: () => false,
          goBack: vi.fn(),
          goForward: vi.fn(),
        },
      },
    }
  }

  const WebContentsView = vi
    .fn()
    .mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock()
    })

  return {
    addChildView,
    removeChildView,
    WebContentsView,
    readFile,
    writeFile,
    mkdir,
    stat,
    createWebContentsViewMock,
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
      webContents: { isDestroyed: () => false },
    })),
  },
  WebContentsView,
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    SandboxOutputViewNavigationChanged: vi.fn(),
  },
}))

vi.mock('fs/promises', () => {
  const api = {
    readFile,
    writeFile,
    mkdir,
    stat,
  }
  return {
    default: api,
    ...api,
  }
})

vi.mock('./result-document-html', () => ({
  renderMarkdownToHtmlDocument: (body: string) =>
    `<html><body>${body}</body></html>`,
  renderMarkdownSourceHtmlDocument: (body: string) =>
    `<html><pre>${body}</pre></html>`,
}))

import { syncSandboxOutputView } from './output-view'

const HTML_FILE_URL = pathToFileURL(join(tmpdir(), 'results', 'index.html')).href
const DIR_FILE_URL = pathToFileURL(join(tmpdir(), 'results')).href

describe('syncSandboxOutputView', () => {
  beforeEach(async () => {
    WebContentsView.mockReset()
    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock()
    })
    readFile.mockReset()
    writeFile.mockReset()
    mkdir.mockReset()
    stat.mockReset()
    stat.mockResolvedValue({
      mtimeMs: 1,
      size: 100,
      isFile: () => true,
      isDirectory: () => false,
    })
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

  it('creates view and loads concrete files via loadFile', async () => {
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: HTML_FILE_URL,
    })
    expect(WebContentsView).toHaveBeenCalled()
    expect(addChildView).toHaveBeenCalled()
    const view = WebContentsView.mock.results.at(-1)?.value
    expect(stat).toHaveBeenCalledWith(fileURLToPath(HTML_FILE_URL))
    expect(view.webContents.loadFile).toHaveBeenCalledWith(
      fileURLToPath(HTML_FILE_URL),
    )
    expect(view.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('loads directory listings via loadURL', async () => {
    stat.mockResolvedValue({
      mtimeMs: 1,
      size: 0,
      isFile: () => false,
      isDirectory: () => true,
    })
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: DIR_FILE_URL,
    })
    const view = WebContentsView.mock.results.at(-1)?.value
    expect(view.webContents.loadURL).toHaveBeenCalledWith(DIR_FILE_URL)
    expect(view.webContents.loadFile).not.toHaveBeenCalled()
  })

  it('shows an error page instead of rejecting when loadFile fails', async () => {
    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock({
        loadFile: vi
          .fn()
          .mockRejectedValueOnce(
            new Error(`ERR_FAILED (-2) loading '${HTML_FILE_URL}'`),
          )
          .mockResolvedValue(undefined),
      })
    })

    await expect(
      syncSandboxOutputView({ sender: {} } as never, {
        screenBounds: { x: 10, y: 20, width: 300, height: 200 },
        fileUrl: HTML_FILE_URL,
      }),
    ).resolves.toBeUndefined()

    const view = WebContentsView.mock.results.at(-1)?.value
    expect(writeFile).toHaveBeenCalled()
    expect(view.webContents.loadFile).toHaveBeenCalledTimes(2)
    expect(view.webContents.loadFile).toHaveBeenNthCalledWith(
      1,
      fileURLToPath(HTML_FILE_URL),
    )
    expect(view.webContents.loadFile).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\.html$/),
    )
  })

  it('renders markdown files as html via temp file', async () => {
    const mdDir = join(mkdtempSync(join(tmpdir(), 'output-view-')), 'output', 'results')
    mkdirSync(mdDir, { recursive: true })
    const mdPath = join(mdDir, 'paper.md')
    writeFileSync(mdPath, '# Title\n\nBody', 'utf8')
    readFile.mockResolvedValue('# Title\n\nBody')
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: pathToFileURL(mdPath).href,
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
    const mdDir = join(mkdtempSync(join(tmpdir(), 'output-view-raw-')), 'output', 'results')
    mkdirSync(mdDir, { recursive: true })
    const mdPath = join(mdDir, 'paper.md')
    writeFileSync(mdPath, '# Title\n\nBody', 'utf8')
    readFile.mockResolvedValue('# Title\n\nBody')
    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: pathToFileURL(mdPath).href,
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
      return createWebContentsViewMock({
        loadFile: vi.fn().mockImplementation(async () => {
          loadAttempt++
          if (loadAttempt === 1) {
            throw new Error(
              "ERR_ABORTED (-3) loading 'file:///tmp/teralexi-sandbox-preview/a.html'",
            )
          }
        }),
      })
    })

    const mdUrl = pathToFileURL(
      join(tmpdir(), 'output', 'results', 'paper.md'),
    ).href

    await expect(
      Promise.all([
        syncSandboxOutputView({ sender: {} } as never, {
          screenBounds: { x: 10, y: 20, width: 300, height: 200 },
          fileUrl: mdUrl,
          markdownView: 'html',
        }),
        syncSandboxOutputView({ sender: {} } as never, {
          screenBounds: { x: 10, y: 20, width: 300, height: 200 },
          fileUrl: mdUrl,
          markdownView: 'raw',
        }),
      ]),
    ).resolves.toBeDefined()
    expect(loadAttempt).toBeGreaterThanOrEqual(2)
  })
})
