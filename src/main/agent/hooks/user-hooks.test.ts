import { describe, expect, it, vi, beforeEach } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { clearUserHooksCache, loadUserHooksConfig, runUserHooks } from './user-hooks'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
}))

vi.mock('@main/skills/extension-host', () => ({
  getExtensionHookBindings: vi.fn(async () => []),
}))

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const globalHooksPath = join(homedir(), '.teralexi', 'hooks.json')
const projectHooksPath = join(process.cwd(), '.teralexi', 'hooks.json')

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
    vi.mocked(existsSync).mockImplementation((path) => String(path) === globalHooksPath)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (String(path) === globalHooksPath) {
        return JSON.stringify({
          hooks: [{ event: 'beforeToolCall', command: 'node', args: ['hook.js'] }],
        })
      }
      return '{}'
    })

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
    vi.mocked(existsSync).mockImplementation((path) => String(path) === globalHooksPath)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (String(path) === globalHooksPath) {
        return JSON.stringify({
          hooks: [{ event: 'afterToolCall', command: 'node', args: ['hook.js'] }],
        })
      }
      return '{}'
    })

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

  it('runs conversation extraHooks after global hooks for preHook', async () => {
    vi.mocked(existsSync).mockImplementation((path) => String(path) === globalHooksPath)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (String(path) === globalHooksPath) {
        return JSON.stringify({
          hooks: [{ event: 'preHook', command: 'global-cmd' }],
        })
      }
      return '{}'
    })

    const calls: string[] = []
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      calls.push(String(args[0]))
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      cb(null, '', '')
      return {} as never
    })

    const result = await runUserHooks(
      { event: 'preHook', conversationId: 'c1', userMessage: 'hi' },
      [{ id: 'local', event: 'preHook', command: 'local-cmd' }],
    )
    expect(result.blocked).toBe(false)
    expect(calls).toEqual(['global-cmd', 'local-cmd'])
  })

  it('merges global and project hooks.json', async () => {
    vi.mocked(existsSync).mockImplementation(() => true)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (String(path) === globalHooksPath) {
        return JSON.stringify({
          hooks: [{ event: 'preHook', command: 'global-cmd' }],
        })
      }
      if (String(path) === projectHooksPath) {
        return JSON.stringify({
          hooks: [{ event: 'preHook', command: 'project-cmd' }],
        })
      }
      return '{}'
    })

    const calls: string[] = []
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      calls.push(String(args[0]))
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      cb(null, '', '')
      return {} as never
    })

    await runUserHooks({ event: 'preHook', conversationId: 'c1' })
    expect(calls).toEqual(['project-cmd', 'global-cmd'])
  })

  it('surfaces hookSpecificOutput parsed from stdout JSON', async () => {
    vi.mocked(existsSync).mockImplementation((path) => String(path) === globalHooksPath)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (String(path) === globalHooksPath) {
        return JSON.stringify({
          hooks: [{ event: 'afterToolCall', command: 'node' }],
        })
      }
      return '{}'
    })
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      cb(
        null,
        JSON.stringify({
          hookSpecificOutput: { additionalContext: 'be careful' },
        }),
        '',
      )
      return {} as never
    })

    const result = await runUserHooks({
      event: 'afterToolCall',
      toolName: 'read_file',
    })
    expect(result.hookSpecificOutput).toEqual({
      additionalContext: 'be careful',
    })
  })
})
