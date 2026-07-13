import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const webContentSend = vi.hoisted(() => ({
  WorkspaceFilesChanged: vi.fn(),
}))

const ensureFilesCwd = vi.hoisted(() => vi.fn())

const watchMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: {} }],
  },
}))

vi.mock('@main/services/web-content-send', () => ({ webContentSend }))

vi.mock('./workspace-ipc-helpers', () => ({ ensureFilesCwd }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    watch: watchMock,
  }
})

import {
  unwatchAllWorkspaceFiles,
  unwatchWorkspaceFiles,
  watchWorkspaceFiles,
} from './workspace-file-watcher'

type MockWatcher = EventEmitter & {
  close: ReturnType<typeof vi.fn>
}

function createMockWatcher(): MockWatcher {
  const watcher = new EventEmitter() as MockWatcher
  watcher.close = vi.fn()
  return watcher
}

describe('workspace-file-watcher', () => {
  let mockWatcher: MockWatcher
  let onChange: (() => void) | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    mockWatcher = createMockWatcher()
    onChange = undefined
    watchMock.mockReset()
    watchMock.mockImplementation(
      (_cwd: string, _opts: unknown, listener?: () => void) => {
        onChange = listener
        return mockWatcher
      },
    )
    ensureFilesCwd.mockReset()
    ensureFilesCwd.mockResolvedValue({
      ok: true,
      cwd: '/tmp/ws-watch',
      source: 'workspace',
    })
    webContentSend.WorkspaceFilesChanged.mockClear()
    unwatchAllWorkspaceFiles()
  })

  afterEach(() => {
    unwatchAllWorkspaceFiles()
    vi.useRealTimers()
  })

  it('notifies renderer after filesystem change (debounced)', async () => {
    const result = await watchWorkspaceFiles('conv-1')
    expect(result.ok).toBe(true)
    expect(watchMock).toHaveBeenCalledWith(
      '/tmp/ws-watch',
      { recursive: true },
      expect.any(Function),
    )

    onChange?.()
    expect(webContentSend.WorkspaceFilesChanged).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(499)
    expect(webContentSend.WorkspaceFilesChanged).not.toHaveBeenCalled()

    // Rapid events reset the debounce window.
    onChange?.()
    await vi.advanceTimersByTimeAsync(500)

    expect(webContentSend.WorkspaceFilesChanged).toHaveBeenCalledTimes(1)
    expect(webContentSend.WorkspaceFilesChanged).toHaveBeenCalledWith(
      {},
      { conversationId: 'conv-1' },
    )
  })

  it('reuses watcher when cwd is unchanged', async () => {
    await watchWorkspaceFiles('conv-1')
    await watchWorkspaceFiles('conv-1')

    expect(ensureFilesCwd).toHaveBeenCalledTimes(2)
    expect(watchMock).toHaveBeenCalledTimes(1)
  })

  it('stops watcher on unwatch', async () => {
    await watchWorkspaceFiles('conv-1')
    unwatchWorkspaceFiles('conv-1')

    expect(mockWatcher.close).toHaveBeenCalled()

    onChange?.()
    await vi.advanceTimersByTimeAsync(600)

    expect(webContentSend.WorkspaceFilesChanged).not.toHaveBeenCalled()
  })
})
