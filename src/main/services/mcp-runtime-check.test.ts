import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => ''),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: vi.fn(() => '/Users/tester'),
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

import { execFileSync } from 'node:child_process'
import {
  buildMcpSpawnPath,
  checkMcpRuntimeStatus,
  resetLoginShellPathCache,
  resolveCommandOnPath,
  resolveCommonUserBinPaths,
  resolveLoginShellPath,
} from './mcp-runtime-check'

describe('mcp-runtime-check', () => {
  beforeEach(() => {
    resetLoginShellPathCache()
    vi.mocked(execFileSync).mockReset()
    vi.mocked(existsSync).mockReset()
  })

  it('builds an augmented PATH for MCP spawns', () => {
    expect(buildMcpSpawnPath()).toContain('/opt/homebrew/bin')
  })

  it('includes pyenv shims such as ~/.pyenv/shims/uvx', () => {
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

  it('uses login-shell PATH for GUI apps missing shell init', () => {
    vi.mocked(execFileSync).mockImplementation((file, args) => {
      if (String(file).endsWith('zsh') && Array.isArray(args)) {
        return '/Users/tester/.nvm/versions/node/v22/bin:/opt/homebrew/bin'
      }
      return ''
    })
    process.env.SHELL = '/bin/zsh'

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

  it('reports npx availability when executable responds', () => {
    vi.mocked(existsSync).mockImplementation((target) =>
      String(target).endsWith('/opt/homebrew/bin/npx'),
    )
    vi.mocked(execFileSync).mockImplementation((file, args) => {
      if (String(file).endsWith('npx')) return '10.0.0'
      return ''
    })

    const status = checkMcpRuntimeStatus()
    expect(status.npx.available).toBe(true)
    expect(status.npx.resolvedPath).toBe('/opt/homebrew/bin/npx')
  })
})
