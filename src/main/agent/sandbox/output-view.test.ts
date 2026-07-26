import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  addChildView,
  removeChildView,
  WebContentsView,
  readFile,
  writeFile,
  mkdir,
  createWebContentsViewMock,
} = vi.hoisted(() => {
  const addChildView = vi.fn()
  const removeChildView = vi.fn()
  const readFile = vi.fn()
  const writeFile = vi.fn()
  const mkdir = vi.fn()

  function createWebContentsViewMock(overrides?: {
    loadFile?: ReturnType<typeof vi.fn>
    loadURL?: ReturnType<typeof vi.fn>
  }) {
    return {
      setBackgroundColor: vi.fn(),
      setBounds: vi.fn(),
      webContents: {
        isDestroyed: () => false,
        getURL: () => '',
        loadURL: overrides?.loadURL ?? vi.fn().mockResolvedValue(undefined),
        loadFile: overrides?.loadFile ?? vi.fn().mockResolvedValue(undefined),
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

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    default: {
      ...actual,
      readFile: (...args: Parameters<typeof actual.readFile>) =>
        readFile(...args),
      writeFile: (...args: Parameters<typeof actual.writeFile>) =>
        writeFile(...args),
      mkdir: (...args: Parameters<typeof actual.mkdir>) => mkdir(...args),
    },
    readFile: (...args: Parameters<typeof actual.readFile>) =>
      readFile(...args),
    writeFile: (...args: Parameters<typeof actual.writeFile>) =>
      writeFile(...args),
    mkdir: (...args: Parameters<typeof actual.mkdir>) => mkdir(...args),
  }
})

vi.mock('./result-document-html', () => ({
  renderMarkdownToHtmlDocument: (body: string) =>
    `<html><body>${body}</body></html>`,
  renderMarkdownSourceHtmlDocument: (body: string) =>
    `<html><pre>${body}</pre></html>`,
}))

import {
  resetSandboxOutputViewStateForTests,
  syncSandboxOutputView,
} from './output-view'

function makeTempResultsDir(tag: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), `output-view-${tag}-`)), 'results')
  mkdirSync(dir, { recursive: true })
  return dir
}

function latestView() {
  const view = WebContentsView.mock.results.at(-1)?.value
  expect(view).toBeTruthy()
  return view as ReturnType<typeof createWebContentsViewMock>
}

describe('syncSandboxOutputView', () => {
  beforeEach(async () => {
    await resetSandboxOutputViewStateForTests()
    WebContentsView.mockReset()
    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock()
    })
    readFile.mockReset()
    writeFile.mockReset()
    mkdir.mockReset()
    // Temp preview HTML write/read stubs (markdown + error pages).
    writeFile.mockResolvedValue(undefined)
    mkdir.mockResolvedValue(undefined)
    readFile.mockResolvedValue('# Title')
    addChildView.mockClear()
    removeChildView.mockClear()
  })

  afterEach(async () => {
    await resetSandboxOutputViewStateForTests()
  })

  it('no-ops remove when no overlay exists', async () => {
    await expect(
      syncSandboxOutputView({ sender: {} } as never, {
        screenBounds: { x: 0, y: 0, width: 100, height: 100 },
        fileUrl: null,
      }),
    ).resolves.toBeUndefined()
    expect(WebContentsView).not.toHaveBeenCalled()
  })

  it('creates view and loads concrete files via loadFile', async () => {
    const dir = makeTempResultsDir('html')
    const htmlPath = join(dir, 'index.html')
    writeFileSync(htmlPath, '<html><body>ok</body></html>', 'utf8')
    const fileUrl = pathToFileURL(htmlPath).href

    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl,
      forceReload: true,
    })

    expect(WebContentsView).toHaveBeenCalled()
    expect(addChildView).toHaveBeenCalled()
    const view = latestView()
    expect(view.webContents.loadFile).toHaveBeenCalledWith(htmlPath)
    expect(view.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('loads directory listings via loadURL', async () => {
    const dir = makeTempResultsDir('dir')
    const fileUrl = pathToFileURL(dir).href

    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl,
      forceReload: true,
    })

    const view = latestView()
    expect(view.webContents.loadURL).toHaveBeenCalledWith(fileUrl)
    expect(view.webContents.loadFile).not.toHaveBeenCalled()
  })

  it('shows an error page instead of rejecting when loadFile fails', async () => {
    const dir = makeTempResultsDir('err')
    const htmlPath = join(dir, 'index.html')
    writeFileSync(htmlPath, '<html><body>ok</body></html>', 'utf8')
    const fileUrl = pathToFileURL(htmlPath).href

    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock({
        loadFile: vi
          .fn()
          .mockRejectedValueOnce(
            new Error(`ERR_FAILED (-2) loading '${fileUrl}'`),
          )
          .mockResolvedValue(undefined),
      })
    })

    await expect(
      syncSandboxOutputView({ sender: {} } as never, {
        screenBounds: { x: 10, y: 20, width: 300, height: 200 },
        fileUrl,
        forceReload: true,
      }),
    ).resolves.toBeUndefined()

    const view = latestView()
    expect(writeFile).toHaveBeenCalled()
    expect(view.webContents.loadFile).toHaveBeenCalledTimes(2)
    expect(view.webContents.loadFile).toHaveBeenNthCalledWith(1, htmlPath)
    expect(view.webContents.loadFile).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\.html$/),
    )
  })

  it('renders markdown files as html via temp file', async () => {
    const dir = makeTempResultsDir('md-html')
    const mdPath = join(dir, 'paper.md')
    writeFileSync(mdPath, '# Title\n\nBody', 'utf8')
    readFile.mockResolvedValue('# Title\n\nBody')

    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: pathToFileURL(mdPath).href,
      markdownView: 'html',
      forceReload: true,
    })

    const view = latestView()
    expect(readFile).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalled()
    expect(view.webContents.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.html$/),
    )
    expect(view.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('shows markdown source in html when raw mode is requested', async () => {
    const dir = makeTempResultsDir('md-raw')
    const mdPath = join(dir, 'paper.md')
    writeFileSync(mdPath, '# Title\n\nBody', 'utf8')
    readFile.mockResolvedValue('# Title\n\nBody')

    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl: pathToFileURL(mdPath).href,
      markdownView: 'raw',
      forceReload: true,
    })

    const view = latestView()
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
    const dir = makeTempResultsDir('md-race')
    const mdPath = join(dir, 'paper.md')
    writeFileSync(mdPath, '# Title', 'utf8')
    readFile.mockResolvedValue('# Title')

    let loadAttempt = 0
    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock({
        loadFile: vi.fn().mockImplementation(async () => {
          loadAttempt += 1
          if (loadAttempt === 1) {
            throw new Error(
              `ERR_ABORTED (-3) loading '${pathToFileURL(join(tmpdir(), 'teralexi-sandbox-preview', 'a.html')).href}'`,
            )
          }
        }),
      })
    })

    const mdUrl = pathToFileURL(mdPath).href
    await expect(
      Promise.all([
        syncSandboxOutputView({ sender: {} } as never, {
          screenBounds: { x: 10, y: 20, width: 300, height: 200 },
          fileUrl: mdUrl,
          markdownView: 'html',
          forceReload: true,
        }),
        syncSandboxOutputView({ sender: {} } as never, {
          screenBounds: { x: 10, y: 20, width: 300, height: 200 },
          fileUrl: mdUrl,
          markdownView: 'raw',
          forceReload: true,
        }),
      ]),
    ).resolves.toBeDefined()
    expect(loadAttempt).toBeGreaterThanOrEqual(2)
  })

  it('recovers after a prior load-chain failure so later previews still use loadFile', async () => {
    const dir = makeTempResultsDir('recover')
    const htmlPath = join(dir, 'index.html')
    writeFileSync(htmlPath, '<html><body>ok</body></html>', 'utf8')
    const fileUrl = pathToFileURL(htmlPath).href

    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock({
        loadFile: vi
          .fn()
          .mockRejectedValueOnce(new Error('ERR_FAILED (-2) boom'))
          .mockResolvedValue(undefined),
      })
    })

    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl,
      forceReload: true,
    })

    // Leave an artificial rejected chain entry, then ensure cleanup + next load
    // still succeed (guards against the historical flake).
    await resetSandboxOutputViewStateForTests()
    WebContentsView.mockImplementation(function WebContentsViewMock() {
      return createWebContentsViewMock()
    })

    await syncSandboxOutputView({ sender: {} } as never, {
      screenBounds: { x: 10, y: 20, width: 300, height: 200 },
      fileUrl,
      forceReload: true,
    })

    const view = latestView()
    expect(view.webContents.loadFile).toHaveBeenCalledWith(htmlPath)
    expect(view.webContents.loadURL).not.toHaveBeenCalled()
  })
})
