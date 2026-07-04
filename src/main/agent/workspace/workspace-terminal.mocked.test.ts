import { EventEmitter } from 'node:events'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

class FakeStream extends EventEmitter {
  setEncoding(_enc: string) {}
}

type FakeChild = EventEmitter & {
  stdout: FakeStream
  stderr: FakeStream
  kill: ReturnType<typeof vi.fn>
  pid: number
}

const { spawnMock, execFileSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  execFileSyncMock: vi.fn(),
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: spawnMock,
    execFileSync: execFileSyncMock,
  }
})

vi.mock('./git-service', () => ({
  resolvePathInsideWorkspace: vi.fn((_cwd: string, relativePath: string) => {
    if (relativePath === '../escape') {
      return { ok: false, error: 'Path escapes the workspace folder.' }
    }
    return { ok: true, absolutePath: '/tmp/workspace' }
  }),
}))

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new FakeStream()
  child.stderr = new FakeStream()
  child.pid = 42
  child.kill = vi.fn(() => true)
  return child
}

beforeEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  spawnMock.mockReset()
  execFileSyncMock.mockReset()
  execFileSyncMock.mockImplementation(() => '')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('workspace-terminal (mocked child_process)', () => {
  it('returns error path from child error event', async () => {
    const child = makeChild()
    spawnMock.mockReturnValueOnce(child)

    const { runWorkspaceTerminalCommandWithControl } =
      await import('./workspace-terminal')

    const pending = runWorkspaceTerminalCommandWithControl({
      conversationId: 'err-case',
      workspaceCwd: '/tmp',
      command: 'echo hi',
    })

    child.emit('error', new Error('spawn boom'))

    const result = await pending
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('spawn boom')
      expect(result.exitCode).toBe(1)
    }
  })

  it('returns interrupted result when close receives signal', async () => {
    const child = makeChild()
    spawnMock.mockReturnValueOnce(child)

    const { runWorkspaceTerminalCommandWithControl } =
      await import('./workspace-terminal')

    const pending = runWorkspaceTerminalCommandWithControl({
      conversationId: 'signal-case',
      workspaceCwd: '/tmp',
      command: 'echo hi',
    })

    child.stdout.emit('data', 'some-out\n')
    child.stderr.emit('data', 'some-err\n')
    child.emit('close', 130, 'SIGINT')

    const result = await pending
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('interrupted by SIGINT')
      expect(result.stdout).toContain('some-out')
      expect(result.stderr).toContain('some-err')
    }
  })

  it('returns cancel error when interrupt fails', async () => {
    const child = makeChild()
    child.kill = vi.fn(() => false)
    execFileSyncMock.mockImplementation(() => {
      throw new Error('taskkill failed')
    })
    spawnMock.mockReturnValueOnce(child)

    const mod = await import('./workspace-terminal')

    const pending = mod.runWorkspaceTerminalCommandWithControl({
      conversationId: 'kill-false',
      workspaceCwd: '/tmp',
      command: 'echo hi',
    })

    const cancel = mod.cancelWorkspaceTerminalCommand('kill-false')
    expect(cancel.ok).toBe(false)
    if (!cancel.ok) expect(cancel.error).toContain('Failed to send interrupt')

    child.emit('close', 0, null)
    await pending
  })

  it('force-kills after timeout if process is still active', async () => {
    vi.useFakeTimers()
    const child = makeChild()
    spawnMock.mockReturnValueOnce(child)

    const mod = await import('./workspace-terminal')

    const pending = mod.runWorkspaceTerminalCommandWithControl({
      conversationId: 'force-kill',
      workspaceCwd: '/tmp',
      command: 'echo hi',
    })

    const cancel = mod.cancelWorkspaceTerminalCommand('force-kill')
    expect(cancel.ok).toBe(true)

    vi.advanceTimersByTime(1600)

    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledTimes(2)
      expect(execFileSyncMock).not.toHaveBeenCalled()
    } else {
      expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGINT')
      expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
    }

    child.emit('close', process.platform === 'win32' ? 1 : 137, null)
    await pending
  })

  it('returns resolvePathInsideWorkspace failure as result', async () => {
    const child = makeChild()
    spawnMock.mockReturnValueOnce(child)
    const { runWorkspaceTerminalCommandWithControl } =
      await import('./workspace-terminal')

    const result = await runWorkspaceTerminalCommandWithControl({
      conversationId: 'escape-case',
      workspaceCwd: '/tmp',
      command: 'echo hi',
      relativeCwd: '../escape',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('escape')
  })
})
