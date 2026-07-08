import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const webContentSend = vi.hoisted(() => ({
  WorkspaceFilesChanged: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: {} }],
  },
}))

vi.mock('@main/services/web-content-send', () => ({ webContentSend }))

const ensureFilesCwd = vi.hoisted(() => vi.fn())

vi.mock('./workspace-ipc-helpers', () => ({ ensureFilesCwd }))

import {
  unwatchAllWorkspaceFiles,
  unwatchWorkspaceFiles,
  watchWorkspaceFiles,
} from './workspace-file-watcher'

describe('workspace-file-watcher', () => {
  let tempDir: string

  beforeEach(() => {
    vi.useFakeTimers()
    tempDir = mkdtempSync(join(tmpdir(), 'ws-watch-'))
    ensureFilesCwd.mockReset()
    webContentSend.WorkspaceFilesChanged.mockClear()
    unwatchAllWorkspaceFiles()
  })

  afterEach(() => {
    unwatchAllWorkspaceFiles()
    vi.useRealTimers()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('notifies renderer after filesystem change (debounced)', async () => {
    vi.useRealTimers()
    ensureFilesCwd.mockResolvedValue({ ok: true, cwd: tempDir, source: 'workspace' })

    const result = await watchWorkspaceFiles('conv-1')
    expect(result.ok).toBe(true)

    writeFileSync(join(tempDir, 'new-file.txt'), 'hello')

    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(webContentSend.WorkspaceFilesChanged).toHaveBeenCalledWith(
      {},
      { conversationId: 'conv-1' },
    )
    vi.useFakeTimers()
  })

  it('reuses watcher when cwd is unchanged', async () => {
    ensureFilesCwd.mockResolvedValue({ ok: true, cwd: tempDir, source: 'workspace' })

    await watchWorkspaceFiles('conv-1')
    await watchWorkspaceFiles('conv-1')

    expect(ensureFilesCwd).toHaveBeenCalledTimes(2)
  })

  it('stops watcher on unwatch', async () => {
    ensureFilesCwd.mockResolvedValue({ ok: true, cwd: tempDir, source: 'workspace' })
    await watchWorkspaceFiles('conv-1')
    unwatchWorkspaceFiles('conv-1')

    writeFileSync(join(tempDir, 'after-unwatch.txt'), 'x')
    await vi.advanceTimersByTimeAsync(600)

    expect(webContentSend.WorkspaceFilesChanged).not.toHaveBeenCalled()
  })
})
