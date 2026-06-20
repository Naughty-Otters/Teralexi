import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// electron must be mocked before module import
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

// node-pty mock — returns a controllable fake IPty
const mockPtyInstance = {
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  pid: 1234,
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyInstance),
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    WorkspaceTerminalStarted: vi.fn(),
    WorkspaceTerminalData: vi.fn(),
    WorkspaceTerminalExit: vi.fn(),
  },
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import {
  startWorkspaceTerminalSession,
  stopWorkspaceTerminalSession,
  writeWorkspaceTerminalInput,
  resizeWorkspaceTerminalSession,
} from './workspace-terminal-pty'
import { webContentSend } from '@main/services/web-content-send'

const spawnMock = pty.spawn as MockedFunction<typeof pty.spawn>
const getAllWindowsMock = BrowserWindow.getAllWindows as MockedFunction<
  typeof BrowserWindow.getAllWindows
>

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'moderatus-pty-test-'))
  vi.clearAllMocks()
  // By default, no open windows
  getAllWindowsMock.mockReturnValue([])
  // Reset pty spawn mock to return our fake instance
  spawnMock.mockReturnValue(mockPtyInstance as any)
  // Reset mock instance state
  mockPtyInstance.onData.mockReset()
  mockPtyInstance.onExit.mockReset()
  mockPtyInstance.write.mockReset()
  mockPtyInstance.resize.mockReset()
  mockPtyInstance.kill.mockReset()
})

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  // Make sure we stop any session started during the test
})

// ─── stopWorkspaceTerminalSession ─────────────────────────────────────────────

describe('stopWorkspaceTerminalSession', () => {
  it('returns error for empty conversationId', () => {
    const result = stopWorkspaceTerminalSession('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/conversationId/)
  })

  it('returns ok when no session exists', () => {
    const result = stopWorkspaceTerminalSession('no-such-id')
    expect(result.ok).toBe(true)
  })

  it('kills pty and removes session', () => {
    // Start a session first
    startWorkspaceTerminalSession({
      conversationId: 'stop-test',
      workspaceCwd: dir,
    })
    expect(spawnMock).toHaveBeenCalledOnce()

    const result = stopWorkspaceTerminalSession('stop-test')
    expect(result.ok).toBe(true)
    expect(mockPtyInstance.kill).toHaveBeenCalledOnce()

    // After stop, write should fail (session gone)
    const write = writeWorkspaceTerminalInput({
      conversationId: 'stop-test',
      data: 'hello',
    })
    expect(write.ok).toBe(false)
  })

  it('handles pty.kill() throwing without propagating error', () => {
    startWorkspaceTerminalSession({
      conversationId: 'stop-throw',
      workspaceCwd: dir,
    })
    mockPtyInstance.kill.mockImplementationOnce(() => {
      throw new Error('already dead')
    })
    const result = stopWorkspaceTerminalSession('stop-throw')
    expect(result.ok).toBe(true)
  })
})

// ─── startWorkspaceTerminalSession ────────────────────────────────────────────

describe('startWorkspaceTerminalSession', () => {
  it('returns error for empty conversationId', () => {
    const result = startWorkspaceTerminalSession({
      conversationId: '  ',
      workspaceCwd: dir,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/conversationId/)
  })

  it('returns error when relativeCwd escapes workspace', () => {
    const result = startWorkspaceTerminalSession({
      conversationId: 'esc',
      workspaceCwd: dir,
      relativeCwd: '../outside',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/escape/)
  })

  it('spawns pty and returns ok with cwd and shell', () => {
    const result = startWorkspaceTerminalSession({
      conversationId: 'start-ok',
      workspaceCwd: dir,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(typeof result.cwd).toBe('string')
    expect(typeof result.shell).toBe('string')
    expect(spawnMock).toHaveBeenCalledOnce()
    // Clean up
    stopWorkspaceTerminalSession('start-ok')
  })

  it('clamps cols/rows to minimums', () => {
    startWorkspaceTerminalSession({
      conversationId: 'clamp',
      workspaceCwd: dir,
      cols: 1,
      rows: 1,
    })
    const spawnArgs = spawnMock.mock.calls[0]
    const opts = spawnArgs?.[2] as { cols: number; rows: number }
    expect(opts.cols).toBeGreaterThanOrEqual(20)
    expect(opts.rows).toBeGreaterThanOrEqual(8)
    stopWorkspaceTerminalSession('clamp')
  })

  it('reuses existing session when cwd and shell match', () => {
    const first = startWorkspaceTerminalSession({
      conversationId: 'reuse',
      workspaceCwd: dir,
    })
    expect(first.ok).toBe(true)
    expect(spawnMock).toHaveBeenCalledOnce()

    const second = startWorkspaceTerminalSession({
      conversationId: 'reuse',
      workspaceCwd: dir,
      shell: first.ok ? first.shell : null,
    })
    expect(second.ok).toBe(true)
    // No second spawn — reused
    expect(spawnMock).toHaveBeenCalledOnce()
    stopWorkspaceTerminalSession('reuse')
  })

  it('replaces session when shell changes', () => {
    startWorkspaceTerminalSession({
      conversationId: 'replace',
      workspaceCwd: dir,
      shell: '/bin/zsh',
    })
    expect(spawnMock).toHaveBeenCalledOnce()

    // Different shell → must kill old and spawn new
    spawnMock.mockClear()
    startWorkspaceTerminalSession({
      conversationId: 'replace',
      workspaceCwd: dir,
      shell: '/bin/bash',
    })
    expect(mockPtyInstance.kill).toHaveBeenCalled()
    expect(spawnMock).toHaveBeenCalledOnce()
    stopWorkspaceTerminalSession('replace')
  })

  it('registers onData and onExit handlers on the pty instance', () => {
    startWorkspaceTerminalSession({
      conversationId: 'handlers',
      workspaceCwd: dir,
    })
    expect(mockPtyInstance.onData).toHaveBeenCalledOnce()
    expect(mockPtyInstance.onExit).toHaveBeenCalledOnce()
    stopWorkspaceTerminalSession('handlers')
  })

  it('broadcasts terminal data when pty onData callback fires', () => {
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {},
    }
    getAllWindowsMock.mockReturnValue([fakeWindow as any])

    startWorkspaceTerminalSession({
      conversationId: 'ondata',
      workspaceCwd: dir,
    })

    const onDataCb = mockPtyInstance.onData.mock.calls[0]?.[0] as
      | ((data: string) => void)
      | undefined
    expect(onDataCb).toBeTypeOf('function')
    onDataCb?.('chunk-data')

    expect(webContentSend.WorkspaceTerminalData).toHaveBeenCalledWith(
      fakeWindow.webContents,
      expect.objectContaining({
        conversationId: 'ondata',
        data: 'chunk-data',
      }),
    )
    stopWorkspaceTerminalSession('ondata')
  })

  it('broadcasts terminal exit and removes session when pty onExit callback fires', () => {
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {},
    }
    getAllWindowsMock.mockReturnValue([fakeWindow as any])

    startWorkspaceTerminalSession({
      conversationId: 'onexit',
      workspaceCwd: dir,
    })

    const onExitCb = mockPtyInstance.onExit.mock.calls[0]?.[0] as
      | ((payload: { exitCode: number; signal?: number }) => void)
      | undefined
    expect(onExitCb).toBeTypeOf('function')
    onExitCb?.({ exitCode: 9, signal: 2 })

    expect(webContentSend.WorkspaceTerminalExit).toHaveBeenCalledWith(
      fakeWindow.webContents,
      expect.objectContaining({
        conversationId: 'onexit',
        exitCode: 9,
        signal: 2,
      }),
    )

    const writeAfterExit = writeWorkspaceTerminalInput({
      conversationId: 'onexit',
      data: 'after-exit',
    })
    expect(writeAfterExit.ok).toBe(false)
  })

  it('retries spawn plans when early plans throw and later plan succeeds', () => {
    spawnMock
      .mockImplementationOnce(() => {
        throw new Error('spawn attempt 1 failed')
      })
      .mockImplementationOnce(() => {
        throw new Error('spawn attempt 2 failed')
      })
      .mockReturnValueOnce(mockPtyInstance as any)

    const result = startWorkspaceTerminalSession({
      conversationId: 'retry-success',
      workspaceCwd: dir,
      shell: '/bin/zsh',
    })

    expect(result.ok).toBe(true)
    expect(spawnMock).toHaveBeenCalledTimes(3)
    stopWorkspaceTerminalSession('retry-success')
  })

  it('returns detailed error when all spawn plans fail', () => {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn failed everywhere')
    })

    const result = startWorkspaceTerminalSession({
      conversationId: 'spawn-fail-all',
      workspaceCwd: dir,
      shell: '/bin/zsh',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Failed to spawn terminal')
    expect(result.error).toContain('Tried plans:')
  })

  it('broadcasts WorkspaceTerminalStarted to all open windows', () => {
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {},
    }
    getAllWindowsMock.mockReturnValue([fakeWindow as any])

    startWorkspaceTerminalSession({
      conversationId: 'broadcast',
      workspaceCwd: dir,
    })

    expect(webContentSend.WorkspaceTerminalStarted).toHaveBeenCalledOnce()
    stopWorkspaceTerminalSession('broadcast')
  })

  it('skips destroyed windows when broadcasting', () => {
    const fakeWindow = {
      isDestroyed: () => true,
      webContents: {},
    }
    getAllWindowsMock.mockReturnValue([fakeWindow as any])

    startWorkspaceTerminalSession({
      conversationId: 'destroyed',
      workspaceCwd: dir,
    })

    expect(webContentSend.WorkspaceTerminalStarted).not.toHaveBeenCalled()
    stopWorkspaceTerminalSession('destroyed')
  })
})

// ─── writeWorkspaceTerminalInput ──────────────────────────────────────────────

describe('writeWorkspaceTerminalInput', () => {
  it('returns error for empty conversationId', () => {
    const result = writeWorkspaceTerminalInput({
      conversationId: '',
      data: 'hi',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/conversationId/)
  })

  it('returns error when session does not exist', () => {
    const result = writeWorkspaceTerminalInput({
      conversationId: 'ghost',
      data: 'hi',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/No terminal session/)
  })

  it('writes data to the pty', () => {
    startWorkspaceTerminalSession({
      conversationId: 'write-test',
      workspaceCwd: dir,
    })
    const result = writeWorkspaceTerminalInput({
      conversationId: 'write-test',
      data: 'ls\n',
    })
    expect(result.ok).toBe(true)
    expect(mockPtyInstance.write).toHaveBeenCalledWith('ls\n')
    stopWorkspaceTerminalSession('write-test')
  })

  it('returns error when pty.write throws', () => {
    startWorkspaceTerminalSession({
      conversationId: 'write-throw',
      workspaceCwd: dir,
    })
    mockPtyInstance.write.mockImplementationOnce(() => {
      throw new Error('pipe broken')
    })
    const result = writeWorkspaceTerminalInput({
      conversationId: 'write-throw',
      data: 'x',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('pipe broken')
    stopWorkspaceTerminalSession('write-throw')
  })
})

// ─── resizeWorkspaceTerminalSession ───────────────────────────────────────────

describe('resizeWorkspaceTerminalSession', () => {
  it('returns error for empty conversationId', () => {
    const result = resizeWorkspaceTerminalSession({
      conversationId: '',
      cols: 80,
      rows: 24,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/conversationId/)
  })

  it('returns error when session does not exist', () => {
    const result = resizeWorkspaceTerminalSession({
      conversationId: 'ghost-resize',
      cols: 80,
      rows: 24,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/No terminal session/)
  })

  it('resizes the pty to provided cols/rows', () => {
    startWorkspaceTerminalSession({
      conversationId: 'resize-ok',
      workspaceCwd: dir,
    })
    const result = resizeWorkspaceTerminalSession({
      conversationId: 'resize-ok',
      cols: 120,
      rows: 40,
    })
    expect(result.ok).toBe(true)
    expect(mockPtyInstance.resize).toHaveBeenCalledWith(120, 40)
    stopWorkspaceTerminalSession('resize-ok')
  })

  it('clamps cols/rows to minimums', () => {
    startWorkspaceTerminalSession({
      conversationId: 'resize-clamp',
      workspaceCwd: dir,
    })
    resizeWorkspaceTerminalSession({
      conversationId: 'resize-clamp',
      cols: 0,
      rows: 0,
    })
    const [cols, rows] = mockPtyInstance.resize.mock.calls[0] as [
      number,
      number,
    ]
    expect(cols).toBeGreaterThanOrEqual(20)
    expect(rows).toBeGreaterThanOrEqual(8)
    stopWorkspaceTerminalSession('resize-clamp')
  })

  it('returns error when pty.resize throws', () => {
    startWorkspaceTerminalSession({
      conversationId: 'resize-throw',
      workspaceCwd: dir,
    })
    mockPtyInstance.resize.mockImplementationOnce(() => {
      throw new Error('resize failed')
    })
    const result = resizeWorkspaceTerminalSession({
      conversationId: 'resize-throw',
      cols: 80,
      rows: 24,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('resize failed')
    stopWorkspaceTerminalSession('resize-throw')
  })
})
