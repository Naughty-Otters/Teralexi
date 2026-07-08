import { describe, expect, it, vi, beforeEach } from 'vitest'

const loadConversationWorkspace = vi.hoisted(() => vi.fn())
const listOpenDocumentsForWorkspace = vi.hoisted(() => vi.fn())

vi.mock('../../workspace/conversation-workspace', () => ({
  loadConversationWorkspace,
}))

vi.mock('../../lsp/editor-lsp-bridge', () => ({
  getEditorLspBridge: () => ({ listOpenDocumentsForWorkspace }),
  relativePathFromAbs: (root: string, abs: string) =>
    abs.startsWith(root) ? abs.slice(root.length).replace(/^\/+/, '') : null,
}))

import {
  buildWorkspaceOpenFilesBlock,
  listWorkspaceOpenFiles,
  workspaceOpenFilesInjector,
  MAX_OPEN_FILES_LISTED,
} from './workspace-open-files'

const WS = '/repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listWorkspaceOpenFiles', () => {
  it('returns sorted, de-duplicated workspace-relative paths', () => {
    listOpenDocumentsForWorkspace.mockReturnValue([
      { absPath: '/repo/src/b.ts', languageId: 'typescript' },
      { absPath: '/repo/src/a.ts', languageId: 'typescript' },
      { absPath: '/repo/src/a.ts', languageId: 'typescript' },
    ])
    expect(listWorkspaceOpenFiles(WS)).toEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('buildWorkspaceOpenFilesBlock', () => {
  it('returns empty when no files are open', () => {
    listOpenDocumentsForWorkspace.mockReturnValue([])
    expect(buildWorkspaceOpenFilesBlock(WS)).toBe('')
  })

  it('renders a bounded block with an overflow line', () => {
    const docs = Array.from({ length: MAX_OPEN_FILES_LISTED + 3 }, (_, i) => ({
      absPath: `/repo/src/file-${String(i).padStart(2, '0')}.ts`,
      languageId: 'typescript',
    }))
    listOpenDocumentsForWorkspace.mockReturnValue(docs)

    const block = buildWorkspaceOpenFilesBlock(WS)
    expect(block).toContain('=== OPEN EDITOR FILES ===')
    expect(block).toContain('- src/file-00.ts')
    expect(block).toContain('…and 3 more open file(s)')
  })
})

describe('workspaceOpenFilesInjector', () => {
  it('applies only when a workspace is set', () => {
    loadConversationWorkspace.mockReturnValue(WS)
    expect(
      workspaceOpenFilesInjector.applies({
        ctx: { opts: { conversationId: 'c1' } },
      } as never),
    ).toBe(true)

    loadConversationWorkspace.mockReturnValue(null)
    expect(
      workspaceOpenFilesInjector.applies({
        ctx: { opts: { conversationId: 'c1' } },
      } as never),
    ).toBe(false)

    expect(
      workspaceOpenFilesInjector.applies({
        ctx: { opts: {} },
      } as never),
    ).toBe(false)
  })

  it('injects the block when files are open, else null', () => {
    loadConversationWorkspace.mockReturnValue(WS)
    listOpenDocumentsForWorkspace.mockReturnValue([
      { absPath: '/repo/main.ts', languageId: 'typescript' },
    ])
    expect(
      workspaceOpenFilesInjector.injectInstructions({
        ctx: { opts: { conversationId: 'c1' } },
      } as never),
    ).toContain('- main.ts')

    listOpenDocumentsForWorkspace.mockReturnValue([])
    expect(
      workspaceOpenFilesInjector.injectInstructions({
        ctx: { opts: { conversationId: 'c1' } },
      } as never),
    ).toBeNull()
  })
})
