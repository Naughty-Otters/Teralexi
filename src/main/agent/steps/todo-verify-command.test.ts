import { describe, expect, it, vi, beforeEach } from 'vitest'
import { runTodoVerifyCommand } from './todo-verify-command'

vi.mock('../workspace/conversation-workspace', () => ({
  getWorkspacePath: vi.fn(() => '/tmp/workspace'),
}))

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}))

import { getWorkspacePath } from '../workspace/conversation-workspace'

function mockExecSuccess(stdout = 'ok', stderr = '') {
  execFileMock.mockImplementation(
    (
      _exe: string,
      _args: string[],
      _opts: unknown,
      cb: (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void,
    ) => {
      cb(null, stdout, stderr)
    },
  )
}

function mockExecFailure(exitCode = 1, stdout = '', stderr = 'fail') {
  execFileMock.mockImplementation(
    (
      _exe: string,
      _args: string[],
      _opts: unknown,
      cb: (
        err: Error & { code?: number },
        stdout: string,
        stderr: string,
      ) => void,
    ) => {
      const err = new Error('failed') as Error & { code?: number }
      err.code = exitCode
      cb(err, stdout, stderr)
    },
  )
}

describe('runTodoVerifyCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspacePath).mockReturnValue('/tmp/workspace')
  })

  it('returns ok when command exits 0', async () => {
    mockExecSuccess('all good')
    const result = await runTodoVerifyCommand(
      {
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => '/tmp/workspace' },
      } as never,
      'npm test',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.output).toContain('npm test')
      expect(result.output).toContain('all good')
    }
  })

  it('returns error when command exits non-zero', async () => {
    mockExecFailure(2, '', 'tests failed')
    const result = await runTodoVerifyCommand(
      {
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => '/tmp/workspace' },
      } as never,
      'npm test',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('exit code 2')
      expect(result.output).toContain('tests failed')
    }
  })

  it('falls back to sandbox root when no workspace is set', async () => {
    vi.mocked(getWorkspacePath).mockReturnValue(null)
    mockExecSuccess('sandbox ok')
    const result = await runTodoVerifyCommand(
      {
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => '/tmp/sandbox' },
      } as never,
      'npm test',
    )
    expect(result.ok).toBe(true)
    expect(execFileMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: '/tmp/sandbox' }),
      expect.any(Function),
    )
  })

  it('returns error when neither workspace nor sandbox is available', async () => {
    vi.mocked(getWorkspacePath).mockReturnValue(null)
    const result = await runTodoVerifyCommand(
      {
        opts: { conversationId: 'conv-1' },
        sandbox: { getRoot: () => undefined },
      } as never,
      'npm test',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('No workspace folder or sandbox')
    }
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
