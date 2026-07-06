import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectedTeralexiHome, mockHomedir } from '@test-paths'

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  renameSync: vi.fn(),
}))

vi.mock('os', () => ({
  homedir: vi.fn(() => mockHomedir()),
}))

const createRequireMock = vi.fn()

vi.mock('module', () => ({
  createRequire: (...args: unknown[]) => createRequireMock(...args),
}))

describe('teralexi-home', () => {
  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('fs')
    vi.mocked(mkdirSync).mockClear()
    vi.mocked(fs.existsSync).mockClear()
    vi.mocked(fs.renameSync).mockClear()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(homedir).mockReturnValue(mockHomedir())
    createRequireMock.mockImplementation(() => () => {
      throw new Error('electron unavailable')
    })
  })

  async function loadTeralexiHome() {
    return import('./teralexi-home')
  }

  it('initializes app dirs under homedir', async () => {
    const mod = await loadTeralexiHome()
    const home = mod.initializeTeralexiHome(null)
    expect(home).toBe(expectedTeralexiHome())
    expect(mod.isTeralexiHomeInitialized()).toBe(true)
    expect(vi.mocked(mkdirSync)).toHaveBeenCalled()
  })

  it('exposes path helpers after init', async () => {
    const mod = await loadTeralexiHome()
    mod.initializeTeralexiHome(null)

    expect(mod.getTeralexiHome()).toBe(expectedTeralexiHome())
    expect(mod.getTeralexiConfigDir()).toBe(
      join(expectedTeralexiHome(), 'config'),
    )
    vi.mocked(mkdirSync).mockClear()
    expect(mod.getTeralexiDbPath()).toBe(
      join(expectedTeralexiHome(), 'db', 'teralexi.db'),
    )
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join(expectedTeralexiHome(), 'db'),
      { recursive: true },
    )
    expect(mod.getTeralexiWorkspacePath()).toBe(
      join(expectedTeralexiHome(), 'workspace'),
    )
    expect(mod.getTeralexiSandboxDir()).toContain('sandbox')
    expect(mod.getTeralexiSkillsDir()).toContain('skills')
    expect(mod.getTeralexiToolSetDir()).toContain('toolSet')
    expect(mod.getTeralexiLogsDir()).toContain('logs')
    expect(mod.getTeralexiAgentLogsDir()).toContain('agents')
  })

  it('creates channel data dirs', async () => {
    const mod = await loadTeralexiHome()
    mod.initializeTeralexiHome(null)

    expect(mod.getTeralexiWhatsAppAuthDir()).toContain('whatsapp-auth')
    expect(mod.getTeralexiTelegramDataDir()).toContain('telegram-data')
    expect(mod.getTeralexiDiscordDataDir()).toContain('discord-data')
    expect(mod.getTeralexiWeChatDataDir()).toContain('wechat-data')
    expect(mod.getTeralexiSlackDataDir()).toContain('slack-data')
  })

  it('sanitizes agent and user ids for memory paths', async () => {
    const mod = await loadTeralexiHome()
    mod.initializeTeralexiHome(null)

    const dirs = mod.getAgentMemoryDirs('  bad id!!  ')
    expect(dirs.root).toContain('bad_id')
    expect(dirs.block).toContain('block')
    expect(mod.resolveGlobalPersonaSnapshotPath('user@1').toLowerCase()).toContain(
      'profile.json',
    )
    expect(mod.getGlobalPersonaSnapshotPath('')).toContain('default')
    expect(mod.resolveAgentPersonaSnapshotPath('')).toContain('unknown-agent')
  })

  it('ensureDir creates memory agent block paths, not channel dirs', async () => {
    const mod = await loadTeralexiHome()
    mod.initializeTeralexiHome(null)
    vi.mocked(mkdirSync).mockClear()

    const dirs = mod.getAgentMemoryDirs('skill:default')

    expect(dirs.block).toBe(
      join(expectedTeralexiHome(), 'memory', 'skill_default', 'block'),
    )
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(dirs.block, {
      recursive: true,
    })
    expect(vi.mocked(mkdirSync)).not.toHaveBeenCalledWith(
      join(expectedTeralexiHome(), 'channels', 'whatsapp-auth'),
      expect.anything(),
    )
  })

  it('does not redirect app db, config, memory, or logs paths into channels/', async () => {
    const mod = await loadTeralexiHome()
    mod.initializeTeralexiHome(null)
    vi.mocked(mkdirSync).mockClear()

    mod.getTeralexiDbPath()
    mod.getTeralexiConfigDir()
    mod.getTeralexiMemoryVectorsDbPath()
    mod.getTeralexiLogsDir()

    const channelRedirect = join(
      expectedTeralexiHome(),
      'channels',
      'whatsapp-auth',
    )
    for (const call of vi.mocked(mkdirSync).mock.calls) {
      expect(call[0]).not.toBe(channelRedirect)
    }
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join(expectedTeralexiHome(), 'db'),
      { recursive: true },
    )
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join(expectedTeralexiHome(), 'memory'),
      { recursive: true },
    )
  })

  it('creates channel data dirs under channels/', async () => {
    const mod = await loadTeralexiHome()
    mod.initializeTeralexiHome(null)
    vi.mocked(mkdirSync).mockClear()

    mod.getTeralexiWhatsAppAuthDir()

    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join(expectedTeralexiHome(), 'channels', 'whatsapp-auth'),
      { recursive: true },
    )
  })

  it('guessDefaultElectronUserData covers platforms', async () => {
    const mod = await loadTeralexiHome()
    const original = process.platform

    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(mod.guessDefaultElectronUserData('app')).toContain('Application Support')

    Object.defineProperty(process, 'platform', { value: 'win32' })
    expect(mod.guessDefaultElectronUserData('app')).toContain('app')

    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(mod.guessDefaultElectronUserData('app')).toContain('app')

    Object.defineProperty(process, 'platform', { value: original })
  })

  it('uses electron app when available', async () => {
    createRequireMock.mockImplementation(() => () => ({
      app: { getPath: vi.fn(() => '/electron') },
    }))
    const mod = await loadTeralexiHome()
    mod.getTeralexiHome()
    expect(createRequireMock).toHaveBeenCalled()
  })
})
