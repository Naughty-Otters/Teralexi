import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const prewarm = vi.hoisted(() => vi.fn())
const syncEditorDocument = vi.hoisted(() => vi.fn())
const closeEditorDocument = vi.hoisted(() => vi.fn())
const editorLspRequest = vi.hoisted(() => vi.fn())
const setEditorContentResolver = vi.hoisted(() => vi.fn())
const setDiagnosticsHandler = vi.hoisted(() => vi.fn())
const isLspSupportedFile = vi.hoisted(() => vi.fn())
const matchLanguageServer = vi.hoisted(() => vi.fn())
const webContentSend = vi.hoisted(() => ({
  EditorLspNotification: vi.fn(),
}))

vi.mock('@main/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@main/agent/sandbox', () => ({
  resolveUserProjectPath: (cwd: string, rel: string) => `${cwd}/${rel}`,
}))
vi.mock('@main/services/web-content-send', () => ({
  webContentSend,
}))
vi.mock('./language-servers', () => ({
  isLspSupportedFile,
  matchLanguageServer,
}))
vi.mock('./lsp-manager', () => ({
  getLspManager: () => ({
    prewarm,
    syncEditorDocument,
    closeEditorDocument,
    editorLspRequest,
    setEditorContentResolver,
    setDiagnosticsHandler,
  }),
}))

import {
  SYNC_DEBOUNCE_MS,
  absPathFromDiagnosticUri,
  getEditorLspBridge,
  relativePathFromAbs,
  resolveEditorRelativePath,
} from './editor-lsp-bridge'

const BRIDGE_KEY = '__TERALEXI_EDITOR_LSP_BRIDGE__'

describe('editor-lsp-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    delete (globalThis as Record<string, unknown>)[BRIDGE_KEY]
    isLspSupportedFile.mockReturnValue(true)
    matchLanguageServer.mockReturnValue({ languageId: 'typescript' })
    editorLspRequest.mockResolvedValue({ ok: true, result: { items: [] } })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>)[BRIDGE_KEY]
  })

  it('starts and stops an editor session', () => {
    const bridge = getEditorLspBridge()

    expect(bridge.startSession('conv-1', '/ws', null)).toEqual({ ok: true })
    expect(prewarm).toHaveBeenCalledWith('/ws')

    bridge.stopSession('conv-1')
    expect(closeEditorDocument).not.toHaveBeenCalled()
  })

  it('validates session start inputs', () => {
    const bridge = getEditorLspBridge()

    expect(bridge.startSession('', '/ws', null)).toEqual({
      ok: false,
      error: 'conversationId is required.',
    })
    expect(bridge.startSession('conv-1', '', null)).toEqual({
      ok: false,
      error: 'workspaceRoot is required.',
    })
  })

  it('queues document sync and debounces LSP updates', async () => {
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', '/ws', null)

    expect(
      bridge.queueSyncDocument('conv-1', 'src/a.ts', 'const x = 1', 'typescript'),
    ).toEqual({ ok: true })
    expect(syncEditorDocument).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)

    expect(syncEditorDocument).toHaveBeenCalledWith(
      '/ws',
      '/ws/src/a.ts',
      'const x = 1',
      'typescript',
    )
  })

  it('returns ok for unsupported files without syncing', () => {
    isLspSupportedFile.mockReturnValue(false)
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', '/ws', null)

    expect(
      bridge.queueSyncDocument('conv-1', 'README.md', '# title', 'markdown'),
    ).toEqual({ ok: true })
    expect(syncEditorDocument).not.toHaveBeenCalled()
  })

  it('closes documents and untracks owned content', async () => {
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', '/ws', null)
    bridge.queueSyncDocument('conv-1', 'src/a.ts', 'v1', 'typescript')
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)

    expect(bridge.closeDocument('conv-1', 'src/a.ts')).toEqual({ ok: true })
    expect(closeEditorDocument).toHaveBeenCalledWith('/ws', '/ws/src/a.ts')
    expect(bridge.getOwnedContent('/ws', '/ws/src/a.ts')).toBeNull()
  })

  it('forwards LSP requests for open documents', async () => {
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', '/ws', null)
    bridge.queueSyncDocument('conv-1', 'src/a.ts', 'const x = 1', 'typescript')

    const result = await bridge.request('conv-1', 'src/a.ts', 'textDocument/completion', {
      position: { line: 0, character: 6 },
    })

    expect(editorLspRequest).toHaveBeenCalledWith(
      '/ws',
      '/ws/src/a.ts',
      'const x = 1',
      'typescript',
      'textDocument/completion',
      { position: { line: 0, character: 6 } },
    )
    expect(result).toEqual({ ok: true, result: { items: [] } })
  })

  it('publishes diagnostics to the active web contents', () => {
    const webContents = { isDestroyed: () => false }
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', '/ws', webContents as never)
    bridge.queueSyncDocument('conv-1', 'src/a.ts', 'const x = 1', 'typescript')

    bridge.publishDiagnostics('/ws', '/ws/src/a.ts', [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: 'error',
        severity: 1,
      },
    ])

    expect(webContentSend.EditorLspNotification).toHaveBeenCalledWith(webContents, {
      conversationId: 'conv-1',
      relativePath: 'src/a.ts',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: '/ws/src/a.ts',
        diagnostics: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
            message: 'error',
            severity: 1,
          },
        ],
      },
    })
  })

  it('resolves relative paths and diagnostic URIs', () => {
    expect(resolveEditorRelativePath('/ws', 'src/a.ts')).toBe('/ws/src/a.ts')
    expect(relativePathFromAbs('/ws', '/ws/src/a.ts')).toBe('src/a.ts')
    expect(relativePathFromAbs('/ws', '/other/a.ts')).toBeNull()
    expect(absPathFromDiagnosticUri('file:///tmp/a.ts')).toMatch(/\/tmp\/a\.ts$/)
    expect(absPathFromDiagnosticUri('/tmp/a.ts')).toBe('/tmp/a.ts')
    expect(absPathFromDiagnosticUri('file:///%E0%A4%A')).toBeNull()
  })
})
