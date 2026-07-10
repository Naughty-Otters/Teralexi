import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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
  resolveUserProjectPath: (cwd: string, rel: string) =>
    normalize(join(cwd, ...rel.split(/[/\\]+/).filter(Boolean))),
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
// cwd-based abs paths are drive-qualified on Windows (unlike normalize('/ws')).
const WS = resolve('test-ws-root')
const ABS_A_TS = join(WS, 'src', 'a.ts')
const REL_A_TS = 'src/a.ts'
const ABS_OTHER = join(resolve('test-other-root'), 'a.ts')
const ABS_DIAG = join(resolve('test-diag-root'), 'a.ts')

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

    expect(bridge.startSession('conv-1', WS, null)).toEqual({ ok: true })
    expect(prewarm).toHaveBeenCalledWith(WS)

    bridge.stopSession('conv-1')
    expect(closeEditorDocument).not.toHaveBeenCalled()
  })

  it('validates session start inputs', () => {
    const bridge = getEditorLspBridge()

    expect(bridge.startSession('', WS, null)).toEqual({
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
    bridge.startSession('conv-1', WS, null)

    expect(
      bridge.queueSyncDocument('conv-1', REL_A_TS, 'const x = 1', 'typescript'),
    ).toEqual({ ok: true })
    expect(syncEditorDocument).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)

    expect(syncEditorDocument).toHaveBeenCalledWith(
      WS,
      ABS_A_TS,
      'const x = 1',
      'typescript',
    )
  })

  it('returns ok for unsupported files without syncing', () => {
    isLspSupportedFile.mockReturnValue(false)
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', WS, null)

    expect(
      bridge.queueSyncDocument('conv-1', 'README.md', '# title', 'markdown'),
    ).toEqual({ ok: true })
    expect(syncEditorDocument).not.toHaveBeenCalled()
  })

  it('closes documents and untracks owned content', async () => {
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', WS, null)
    bridge.queueSyncDocument('conv-1', REL_A_TS, 'v1', 'typescript')
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)

    expect(bridge.closeDocument('conv-1', REL_A_TS)).toEqual({ ok: true })
    expect(closeEditorDocument).toHaveBeenCalledWith(WS, ABS_A_TS)
    expect(bridge.getOwnedContent(WS, ABS_A_TS)).toBeNull()
  })

  it('forwards LSP requests for open documents', async () => {
    const bridge = getEditorLspBridge()
    bridge.startSession('conv-1', WS, null)
    bridge.queueSyncDocument('conv-1', REL_A_TS, 'const x = 1', 'typescript')

    const result = await bridge.request('conv-1', REL_A_TS, 'textDocument/completion', {
      position: { line: 0, character: 6 },
    })

    expect(editorLspRequest).toHaveBeenCalledWith(
      WS,
      ABS_A_TS,
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
    bridge.startSession('conv-1', WS, webContents as never)
    bridge.queueSyncDocument('conv-1', REL_A_TS, 'const x = 1', 'typescript')

    bridge.publishDiagnostics(WS, ABS_A_TS, [
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
      relativePath: REL_A_TS,
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: ABS_A_TS,
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
    const fileUri = pathToFileURL(ABS_DIAG).href

    expect(resolveEditorRelativePath(WS, REL_A_TS)).toBe(normalize(ABS_A_TS))
    expect(relativePathFromAbs(WS, ABS_A_TS)).toBe(REL_A_TS)
    expect(relativePathFromAbs(WS, ABS_OTHER)).toBeNull()
    expect(absPathFromDiagnosticUri(fileUri)).toBe(normalize(ABS_DIAG))
    expect(absPathFromDiagnosticUri(ABS_DIAG)).toBe(normalize(ABS_DIAG))
    expect(absPathFromDiagnosticUri('file:///%E0%A4%A')).toBeNull()
  })
})
