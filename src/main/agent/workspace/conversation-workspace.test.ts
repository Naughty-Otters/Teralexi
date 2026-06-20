import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearWorkspacePath,
  getWorkspacePath,
  getWorkspaceStack,
  loadConversationWorkspace,
  resetConversationWorkspaceCache,
  setWorkspacePath,
  validateWorkspaceDirectoryPath,
} from './conversation-workspace'

const setConversationWorkspacePath = vi.fn()
const getConversationSettings = vi.fn()

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    setConversationWorkspacePath,
    getConversationSettings,
  }),
}))

describe('validateWorkspaceDirectoryPath', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    resetConversationWorkspaceCache()
    vi.clearAllMocks()
  })

  it('accepts an existing directory', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-ws-valid-'))
    const result = validateWorkspaceDirectoryPath(dir)
    expect(result).toEqual({ ok: true, path: dir })
  })

  it('rejects missing paths and files', () => {
    expect(validateWorkspaceDirectoryPath('')).toMatchObject({ ok: false })
    expect(validateWorkspaceDirectoryPath(join(tmpdir(), 'missing-dir-xyz'))).toMatchObject({
      ok: false,
    })

    dir = mkdtempSync(join(tmpdir(), 'openfde-ws-file-'))
    const file = join(dir, 'not-a-dir.txt')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, 'x')
    expect(validateWorkspaceDirectoryPath(file)).toMatchObject({ ok: false })
  })
})

describe('setWorkspacePath / clearWorkspacePath', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    resetConversationWorkspaceCache()
    vi.clearAllMocks()
  })

  it('persists validated path and builds stack', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-ws-set-'))
    const result = setWorkspacePath('conv-a', dir)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.workspacePath).toBe(dir)
    expect(result.stack).toEqual([
      { type: 'sandbox' },
      { type: 'workspace', path: dir },
    ])
    expect(setConversationWorkspacePath).toHaveBeenCalledWith('conv-a', dir)
  })

  it('rejects empty conversation id', () => {
    expect(setWorkspacePath('', '/tmp')).toEqual({
      ok: false,
      error: 'conversationId is required.',
    })
    expect(clearWorkspacePath('')).toEqual({
      ok: false,
      error: 'conversationId is required.',
    })
  })

  it('clears workspace path', () => {
    const result = clearWorkspacePath('conv-b')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.workspacePath).toBeNull()
    expect(setConversationWorkspacePath).toHaveBeenCalledWith('conv-b', null)
  })

  it('loadConversationWorkspace caches settings lookup', () => {
    getConversationSettings.mockReturnValue({ workspacePath: '/data/proj' })
    resetConversationWorkspaceCache()
    expect(loadConversationWorkspace('conv-cache')).toBe('/data/proj')
    expect(loadConversationWorkspace('conv-cache')).toBe('/data/proj')
    expect(getConversationSettings).toHaveBeenCalledTimes(1)
  })

  it('getWorkspaceStack returns sandbox-only stack when unset', () => {
    getConversationSettings.mockReturnValue({ workspacePath: null })
    resetConversationWorkspaceCache()
    expect(getWorkspaceStack('conv-stack')).toEqual([{ type: 'sandbox' }])
  })

  it('getWorkspaceStack includes workspace entry when configured', () => {
    dir = mkdtempSync(join(tmpdir(), 'openfde-ws-stack-'))
    setWorkspacePath('conv-stack-ws', dir)
    expect(getWorkspaceStack('conv-stack-ws')).toEqual([
      { type: 'sandbox' },
      { type: 'workspace', path: dir },
    ])
  })

  it('getWorkspacePath loads from store when not cached', () => {
    getConversationSettings.mockReturnValue({ workspacePath: '/loaded/path' })
    resetConversationWorkspaceCache()
    expect(getWorkspacePath('conv-get')).toBe('/loaded/path')
  })

  it('resetConversationWorkspaceCache clears all cached paths', () => {
    getConversationSettings.mockReturnValue({ workspacePath: '/cached' })
    resetConversationWorkspaceCache()
    loadConversationWorkspace('conv-reset')
    resetConversationWorkspaceCache()
    loadConversationWorkspace('conv-reset')
    expect(getConversationSettings).toHaveBeenCalledTimes(2)
  })

  it('resetConversationWorkspaceCache can clear a single conversation', () => {
    getConversationSettings.mockReturnValue({ workspacePath: '/cached' })
    resetConversationWorkspaceCache()
    loadConversationWorkspace('conv-one')
    loadConversationWorkspace('conv-two')
    resetConversationWorkspaceCache('conv-one')
    loadConversationWorkspace('conv-one')
    loadConversationWorkspace('conv-two')
    expect(getConversationSettings).toHaveBeenCalledTimes(3)
  })
})
