import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetConversationWorkspaceCache, setWorkspacePath } from './conversation-workspace'
import { isConversationRunInFlight } from '@main/engine'
import { getOrCreateSandboxForConversation } from '@main/agent/sandbox/registry'
import {
  resolveWorkspaceCwd,
  resolveWorkspaceFileOpen,
  resolveFilesCwd,
  resolveFilesFileOpen,
  ensureFilesCwd,
} from './workspace-ipc-helpers'

const setConversationWorkspacePath = vi.fn()
const getConversationSettings = vi.fn()

const { sandboxDirRef } = vi.hoisted(() => ({
  sandboxDirRef: { current: '' as string },
}))

vi.mock('@main/agent/sandbox/registry', () => ({
  resolveSandboxRootForConversation: vi.fn(
    () => sandboxDirRef.current,
  ),
  getOrCreateSandboxForConversation: vi.fn(async () => ({
    layout: { root: sandboxDirRef.current },
  })),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    setConversationWorkspacePath,
    getConversationSettings,
  }),
}))

vi.mock('@main/engine', () => ({
  isConversationRunInFlight: vi.fn(() => false),
}))

describe('resolveWorkspaceCwd', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    resetConversationWorkspaceCache()
    vi.clearAllMocks()
  })

  it('rejects empty conversation id', () => {
    expect(resolveWorkspaceCwd('')).toEqual({
      ok: false,
      error: 'conversationId is required.',
    })
  })

  it('rejects when no workspace is configured', () => {
    getConversationSettings.mockReturnValue({ workspacePath: null })
    expect(resolveWorkspaceCwd('conv-x')).toEqual({
      ok: false,
      error: 'No workspace folder is set for this conversation.',
    })
  })

  it('returns validated cwd when workspace is set', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-ws-ipc-'))
    setWorkspacePath('conv-y', dir)
    expect(resolveWorkspaceCwd('conv-y')).toEqual({ ok: true, cwd: dir })
  })

  it('resolveWorkspaceCwd blocks when agent run is in flight', () => {
    vi.mocked(isConversationRunInFlight).mockReturnValue(true)
    dir = mkdtempSync(join(tmpdir(), 'teralexi-ws-ipc-run-'))
    setWorkspacePath('conv-run', dir)
    expect(resolveWorkspaceCwd('conv-run', { blockIfRunInFlight: true })).toEqual({
      ok: false,
      error:
        'Cannot change workspace or git state while the agent is running for this conversation.',
    })
  })

  it('resolveWorkspaceFileOpen rejects empty relative path', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-ws-ipc-open-empty-'))
    setWorkspacePath('conv-empty-path', dir)
    const result = resolveWorkspaceFileOpen('conv-empty-path', '   ')
    expect(result.ok).toBe(false)
  })

  it('resolveWorkspaceFileOpen rejects paths outside workspace', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-ws-ipc-open-'))
    setWorkspacePath('conv-z', dir)
    const ok = resolveWorkspaceFileOpen('conv-z', 'README.md')
    expect(ok.ok).toBe(true)

    const bad = resolveWorkspaceFileOpen('conv-z', '../../etc/passwd')
    expect(bad.ok).toBe(false)
  })
})

describe('resolveFilesCwd', () => {
  let dir: string
  let sandboxDir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    if (sandboxDir) rmSync(sandboxDir, { recursive: true, force: true })
    sandboxDirRef.current = ''
    resetConversationWorkspaceCache()
    vi.clearAllMocks()
  })

  it('rejects empty conversation id', () => {
    expect(resolveFilesCwd('')).toEqual({
      ok: false,
      error: 'conversationId is required.',
    })
  })

  it('errors when sandbox folder does not exist yet', () => {
    sandboxDirRef.current = join(tmpdir(), `teralexi-missing-${Date.now()}`)
    getConversationSettings.mockReturnValue({ workspacePath: null })

    expect(resolveFilesCwd('conv-missing')).toEqual({
      ok: false,
      error:
        'Sandbox folder does not exist yet. Run the agent once to populate it.',
    })
  })

  it('falls back to sandbox when no workspace is configured', () => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'teralexi-sandbox-files-'))
    sandboxDirRef.current = sandboxDir
    getConversationSettings.mockReturnValue({ workspacePath: null })
    writeFileSync(join(sandboxDir, 'output.txt'), 'sandbox file\n')

    expect(resolveFilesCwd('conv-sandbox')).toEqual({
      ok: true,
      cwd: sandboxDir,
      source: 'sandbox',
    })
  })

  it('prefers workspace over sandbox when both exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-ws-files-'))
    sandboxDir = mkdtempSync(join(tmpdir(), 'teralexi-sandbox-pref-'))
    sandboxDirRef.current = sandboxDir
    setWorkspacePath('conv-pref', dir)

    expect(resolveFilesCwd('conv-pref')).toEqual({
      ok: true,
      cwd: dir,
      source: 'workspace',
    })
  })

  it('ensureFilesCwd returns existing sandbox cwd without creating', async () => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'teralexi-sandbox-existing-'))
    sandboxDirRef.current = sandboxDir
    writeFileSync(join(sandboxDir, 'note.txt'), 'x\n')
    getConversationSettings.mockReturnValue({ workspacePath: null })

    await expect(ensureFilesCwd('conv-existing')).resolves.toEqual({
      ok: true,
      cwd: sandboxDir,
      source: 'sandbox',
    })
    expect(getOrCreateSandboxForConversation).not.toHaveBeenCalled()
  })

  it('ensureFilesCwd creates sandbox when directory is missing', async () => {
    const missing = join(tmpdir(), `teralexi-missing-${Date.now()}`)
    sandboxDirRef.current = missing
    getConversationSettings.mockReturnValue({ workspacePath: null })

    const created = join(tmpdir(), 'teralexi-created-sandbox')
    vi.mocked(getOrCreateSandboxForConversation).mockResolvedValueOnce({
      layout: { root: created },
    } as never)

    await expect(ensureFilesCwd('conv-create')).resolves.toEqual({
      ok: true,
      cwd: created,
      source: 'sandbox',
    })
    expect(getOrCreateSandboxForConversation).toHaveBeenCalledWith('conv-create')
  })

  it('ensureFilesCwd does not create sandbox when workspace path is still configured', async () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-ws-invalid-'))
    setWorkspacePath('conv-invalid', dir)
    rmSync(dir, { recursive: true, force: true })
    sandboxDirRef.current = join(tmpdir(), `teralexi-missing-${Date.now()}`)

    await expect(ensureFilesCwd('conv-invalid')).resolves.toEqual({
      ok: false,
      error:
        'Sandbox folder does not exist yet. Run the agent once to populate it.',
    })
    expect(getOrCreateSandboxForConversation).not.toHaveBeenCalled()
  })

  it('falls back to sandbox when configured workspace path is invalid', () => {
    dir = mkdtempSync(join(tmpdir(), 'teralexi-ws-stale-'))
    setWorkspacePath('conv-stale', dir)
    rmSync(dir, { recursive: true, force: true })

    sandboxDir = mkdtempSync(join(tmpdir(), 'teralexi-sandbox-stale-'))
    sandboxDirRef.current = sandboxDir
    writeFileSync(join(sandboxDir, 'fallback.txt'), 'ok\n')

    expect(resolveFilesCwd('conv-stale')).toEqual({
      ok: true,
      cwd: sandboxDir,
      source: 'sandbox',
    })
  })

  it('resolveFilesFileOpen rejects paths outside root', () => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'teralexi-sandbox-escape-'))
    sandboxDirRef.current = sandboxDir
    getConversationSettings.mockReturnValue({ workspacePath: null })

    const opened = resolveFilesFileOpen('conv-sandbox', '../../outside.txt')
    expect(opened.ok).toBe(false)
  })

  it('resolveFilesFileOpen resolves paths inside sandbox', () => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'teralexi-sandbox-open-'))
    sandboxDirRef.current = sandboxDir
    getConversationSettings.mockReturnValue({ workspacePath: null })
    mkdirSync(join(sandboxDir, 'output'), { recursive: true })
    writeFileSync(join(sandboxDir, 'output', 'results.txt'), 'ok\n')

    const opened = resolveFilesFileOpen('conv-sandbox', 'output/results.txt')
    expect(opened.ok).toBe(true)
    if (opened.ok) {
      expect(opened.absolutePath).toBe(
        join(sandboxDir, 'output', 'results.txt'),
      )
    }
  })
})
