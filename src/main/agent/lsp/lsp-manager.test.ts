import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockStart = vi.fn()
const mockGetDiagnostics = vi.fn()
const mockOpenDocument = vi.fn()
const mockLspRequest = vi.fn()
const mockDispose = vi.fn()

vi.mock('./lsp-client', () => {
  class MockLspClient {
    start = mockStart
    getDiagnostics = mockGetDiagnostics
    openDocument = mockOpenDocument
    lspRequest = mockLspRequest
    syncDocument = mockOpenDocument
    hasOpenDocuments = vi.fn(() => false)
    closeDocument = vi.fn()
    onNotification = vi.fn(() => () => {})
    dispose = mockDispose
  }
  return { LspClient: MockLspClient }
})

const LSP_MANAGER_GLOBAL_KEY = '__TERALEXI_LSP_MANAGER__' as const

import { getLspManager } from './lsp-manager'

function resetLspManager() {
  delete (globalThis as Record<string, unknown>)[LSP_MANAGER_GLOBAL_KEY]
  delete (globalThis as Record<string, unknown>)['__TERALEXI_EDITOR_LSP_BRIDGE__']
}

describe('LspManager', () => {
  let workspaceRoot: string
  let tsFile: string

  beforeEach(async () => {
    resetLspManager()
    mockStart.mockReset()
    mockGetDiagnostics.mockReset()
    mockOpenDocument.mockReset()
    mockLspRequest.mockReset()
    mockDispose.mockReset()

    mockStart.mockResolvedValue(undefined)
    mockGetDiagnostics.mockResolvedValue([
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        severity: 1,
        message: 'Expected number',
      },
    ])
    mockOpenDocument.mockResolvedValue('file:///workspace/src/a.ts')
    mockLspRequest.mockResolvedValue([
      {
        uri: 'file:///workspace/src/a.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 3 },
        },
      },
    ])

    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-lsp-mgr-'))
    await mkdir(path.join(workspaceRoot, 'src'), { recursive: true })
    await writeFile(path.join(workspaceRoot, 'package.json'), '{}', 'utf-8')
    tsFile = path.join(workspaceRoot, 'src', 'a.ts')
    await writeFile(tsFile, 'const x: number = "bad"\n', 'utf-8')
  })

  afterEach(() => {
    getLspManager().closeAll()
    resetLspManager()
  })

  it('returns a shared singleton from getLspManager', () => {
    const a = getLspManager()
    const b = getLspManager()
    expect(a).toBe(b)
  })

  it('getDiagnosticReport reads file and builds report', async () => {
    const report = await getLspManager().getDiagnosticReport(tsFile, workspaceRoot)
    expect(mockStart).toHaveBeenCalled()
    expect(mockGetDiagnostics).toHaveBeenCalledWith(
      tsFile,
      'const x: number = "bad"\n',
      'typescript',
    )
    expect(report.errorCount).toBeGreaterThan(0)
    expect(report.block).toContain('Expected number')
  })

  it('querySymbols returns error when line/character missing for position ops', async () => {
    const result = await getLspManager().querySymbols({
      operation: 'definition',
      absFilePath: tsFile,
      workspaceRoot,
    })
    expect(result).toEqual({
      ok: false,
      error: 'Operation "definition" requires line and character.',
    })
  })

  it('querySymbols normalizes definition locations', async () => {
    const result = await getLspManager().querySymbols({
      operation: 'definition',
      absFilePath: tsFile,
      workspaceRoot,
      line: 1,
      character: 7,
    })

    expect(mockOpenDocument).toHaveBeenCalled()
    expect(mockLspRequest).toHaveBeenCalledWith(
      'textDocument/definition',
      expect.objectContaining({
        position: { line: 0, character: 6 },
      }),
    )
    expect(result).toMatchObject({
      ok: true,
      operation: 'definition',
      locations: expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('a.ts') }),
      ]),
    })
  })

  it('querySymbols returns structured error for unsupported file types', async () => {
    const mdFile = path.join(workspaceRoot, 'readme.md')
    await writeFile(mdFile, '# doc', 'utf-8')

    const result = await getLspManager().querySymbols({
      operation: 'document_symbols',
      absFilePath: mdFile,
      workspaceRoot,
    })

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('No language server is configured'),
    })
  })

  it('closeAll disposes active clients', async () => {
    await getLspManager().getDiagnosticReport(tsFile, workspaceRoot)
    getLspManager().closeAll()
    expect(mockDispose).toHaveBeenCalled()
  })

  it('queryWorkspaceSymbols opens a seed file before workspace/symbol', async () => {
    mockLspRequest.mockResolvedValue([
      {
        name: 'Widget',
        kind: 5,
        location: {
          uri: `file://${tsFile}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 3 },
          },
        },
      },
    ])

    const result = await getLspManager().queryWorkspaceSymbols(workspaceRoot, 'Widget')
    expect(mockOpenDocument).toHaveBeenCalled()
    expect(mockLspRequest).toHaveBeenCalledWith('workspace/symbol', { query: 'Widget' })
    expect(result).toMatchObject({
      ok: true,
      symbols: [
        expect.objectContaining({ name: 'Widget', path: expect.stringContaining('a.ts') }),
      ],
    })
  })
})
