import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isWin, mockTesterHomedir } from '@test-paths'

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_file, _args, _opts, cb) => {
    if (typeof _opts === 'function') {
      _opts(null, { stdout: '' })
      return
    }
    cb?.(null, { stdout: '' })
  }),
  execFileSync: vi.fn(() => ''),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: vi.fn(() => mockTesterHomedir()),
  }
})

vi.mock('@main/config/app-paths', () => ({
  resolveAppRoot: () => '/app',
}))

vi.mock('@main/agent/lsp/language-servers', () => ({
  buildServerPath: () => '/opt/homebrew/bin:/usr/local/bin',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  }
})

import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  buildMcpSpawnPath,
  checkMcpRuntimeStatus,
  prewarmLoginShellPath,
  probeCommandForTests,
  resetDarwinPathCache,
  resetLoginShellPathCache,
  resetMcpRuntimeStatusCache,
  resolveCommandOnPath,
  resolveCommonUserBinPaths,
  resolveLoginShellPath,
} from './mcp-runtime-check'

describe('mcp-runtime-check', () => {
  beforeEach(() => {
    resetLoginShellPathCache()
    resetDarwinPathCache()
    resetMcpRuntimeStatusCache()
    vi.mocked(execFile).mockReset()
    vi.mocked(execFileSync).mockReset()
    vi.mocked(existsSync).mockReset()
  })

  it('builds an augmented PATH for MCP spawns', () => {
    expect(buildMcpSpawnPath()).toContain('/opt/homebrew/bin')
  })

  it.skipIf(isWin)('includes pyenv shims such as ~/.pyenv/shims/uvx', () => {
    const uvxPath = join(homedir(), '.pyenv', 'shims', 'uvx')
    vi.mocked(existsSync).mockImplementation((target) => {
      const value = String(target)
      return (
        value === join(homedir(), '.pyenv', 'shims') ||
        value === uvxPath
      )
    })

    expect(resolveCommonUserBinPaths()).toContain(join(homedir(), '.pyenv', 'shims'))
    expect(resolveCommandOnPath('uvx', buildMcpSpawnPath())).toBe(uvxPath)
  })

  it('includes existing user-local bin dirs such as ~/.local/bin', () => {
    const uvxPath = join(homedir(), '.local', 'bin', 'uvx')
    vi.mocked(existsSync).mockImplementation((target) => {
      const value = String(target)
      return (
        value === join(homedir(), '.local', 'bin') ||
        value === uvxPath
      )
    })

    expect(resolveCommonUserBinPaths()).toContain(join(homedir(), '.local', 'bin'))
    expect(buildMcpSpawnPath()).toContain(join(homedir(), '.local', 'bin'))
    expect(resolveCommandOnPath('uvx', buildMcpSpawnPath())).toBe(uvxPath)
  })

  it.skipIf(isWin)('uses login-shell PATH for GUI apps missing shell init', async () => {
    vi.mocked(execFile).mockImplementation((file, args, opts, cb) => {
      const callback =
        typeof opts === 'function'
          ? opts
          : (cb as (err: Error | null, result: { stdout: string }) => void)
      if (String(file).endsWith('zsh') && Array.isArray(args)) {
        callback(null, {
          stdout: '/Users/tester/.nvm/versions/node/v22/bin:/opt/homebrew/bin',
        })
        return undefined as never
      }
      callback(null, { stdout: '' })
      return undefined as never
    })
    process.env.SHELL = '/bin/zsh'

    await prewarmLoginShellPath()
    expect(resolveLoginShellPath()).toBe(
      '/Users/tester/.nvm/versions/node/v22/bin:/opt/homebrew/bin',
    )
    expect(buildMcpSpawnPath()).toContain(
      '/Users/tester/.nvm/versions/node/v22/bin',
    )
  })

  it('resolves commands on PATH', () => {
    const npxPath = join('/opt/homebrew/bin', 'npx')
    vi.mocked(existsSync).mockImplementation((target) => String(target) === npxPath)
    expect(resolveCommandOnPath('npx', '/opt/homebrew/bin')).toBe(npxPath)
  })

  it.skipIf(isWin)('reports npx availability when executable is on PATH', () => {
    vi.mocked(existsSync).mockImplementation((target) =>
      String(target).endsWith('/opt/homebrew/bin/npx'),
    )

    const status = checkMcpRuntimeStatus()
    expect(status.npx.available).toBe(true)
    expect(status.npx.resolvedPath).toBe('/opt/homebrew/bin/npx')
  })

  it.skipIf(isWin)('probeCommandForTests can verify executable responses', () => {
    vi.mocked(existsSync).mockImplementation((target) =>
      String(target).endsWith('/opt/homebrew/bin/npx'),
    )
    vi.mocked(execFileSync).mockImplementation((file) => {
      if (String(file).endsWith('npx')) return '10.0.0'
      return ''
    })

    expect(
      probeCommandForTests('npx', ['--version'], '/opt/homebrew/bin'),
    ).toBe(true)
  })
})
