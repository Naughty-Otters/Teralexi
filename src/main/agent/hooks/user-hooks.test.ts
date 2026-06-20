import { describe, expect, it, vi, beforeEach } from 'vitest'
import { clearUserHooksCache, loadUserHooksConfig, runUserHooks } from './user-hooks'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
}))

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

describe('user-hooks', () => {
  beforeEach(() => {
    clearUserHooksCache()
    vi.mocked(execFile).mockReset()
  })

  it('returns empty config when no hooks file', () => {
    expect(loadUserHooksConfig().hooks).toEqual([])
  })

  it('does not block when no hooks match', async () => {
    const result = await runUserHooks({
      event: 'beforeToolCall',
      toolName: 'write_file',
    })
    expect(result.blocked).toBe(false)
  })

  it('loads hooks from config file and caches result', () => {
    vi.mocked(existsSync).mockReturnValueOnce(true)
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({
        hooks: [{ event: 'beforeToolCall', command: 'node', args: ['hook.js'] }],
      }),
    )

    const first = loadUserHooksConfig()
    const second = loadUserHooksConfig()
    expect(first.hooks).toHaveLength(1)
    expect(second.hooks).toHaveLength(1)
    expect(readFileSync).toHaveBeenCalledTimes(1)
  })

  it('blocks beforeToolCall when hook execution fails', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({
        hooks: [{ event: 'beforeToolCall', command: 'node', args: ['hook.js'] }],
      }),
    )

    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      cb(new Error('blocked by policy'), '', '')
      return {} as never
    })

    const result = await runUserHooks({ event: 'beforeToolCall', toolName: 'read_file' })
    expect(result.blocked).toBe(true)
    expect(result.message).toContain('blocked by policy')
  })

  it('does not block non-beforeToolCall events on hook errors', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({
        hooks: [{ event: 'afterToolCall', command: 'node', args: ['hook.js'] }],
      }),
    )

    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      cb(new Error('hook failed'), '', '')
      return {} as never
    })

    const result = await runUserHooks({ event: 'afterToolCall', toolName: 'read_file' })
    expect(result.blocked).toBe(false)
  })
})
