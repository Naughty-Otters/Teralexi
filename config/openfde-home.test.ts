import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  renameSync: vi.fn(),
}))

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}))

const createRequireMock = vi.fn()

vi.mock('module', () => ({
  createRequire: (...args: unknown[]) => createRequireMock(...args),
}))

describe('openfde-home', () => {
  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('fs')
    vi.mocked(mkdirSync).mockClear()
    vi.mocked(fs.existsSync).mockClear()
    vi.mocked(fs.renameSync).mockClear()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(homedir).mockReturnValue('/mock-home')
    createRequireMock.mockImplementation(() => () => {
      throw new Error('electron unavailable')
    })
  })

  async function loadopenfdeHome() {
    return import('./openfde-home')
  }

  it('initializes app dirs under homedir', async () => {
    const mod = await loadopenfdeHome()
    const home = mod.initializeopenfdeHome(null)
    expect(home).toBe(join('/mock-home', '.openfde'))
    expect(mod.isopenfdeHomeInitialized()).toBe(true)
    expect(vi.mocked(mkdirSync)).toHaveBeenCalled()
  })

  it('exposes path helpers after init', async () => {
    const mod = await loadopenfdeHome()
    mod.initializeopenfdeHome(null)

    expect(mod.getopenfdeHome()).toBe(join('/mock-home', '.openfde'))
    expect(mod.getopenfdeConfigDir()).toBe(
      join('/mock-home', '.openfde', 'config'),
    )
    vi.mocked(mkdirSync).mockClear()
    expect(mod.getopenfdeDbPath()).toBe(
      join('/mock-home', '.openfde', 'db', 'openfde.db'),
    )
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join('/mock-home', '.openfde', 'db'),
      { recursive: true },
    )
    expect(mod.getopenfdeWorkspacePath()).toBe(
      join('/mock-home', '.openfde', 'workspace'),
    )
    expect(mod.getopenfdeSandboxDir()).toContain('sandbox')
    expect(mod.getopenfdeSkillsDir()).toContain('skills')
    expect(mod.getopenfdeToolSetDir()).toContain('toolSet')
    expect(mod.getopenfdeLogsDir()).toContain('logs')
    expect(mod.getopenfdeAgentLogsDir()).toContain('agents')
  })

  it('creates channel data dirs', async () => {
    const mod = await loadopenfdeHome()
    mod.initializeopenfdeHome(null)

    expect(mod.getopenfdeWhatsAppAuthDir()).toContain('whatsapp-auth')
    expect(mod.getopenfdeTelegramDataDir()).toContain('telegram-data')
    expect(mod.getopenfdeDiscordDataDir()).toContain('discord-data')
    expect(mod.getopenfdeWeChatDataDir()).toContain('wechat-data')
    expect(mod.getopenfdeSlackDataDir()).toContain('slack-data')
  })

  it('sanitizes agent and user ids for memory paths', async () => {
    const mod = await loadopenfdeHome()
    mod.initializeopenfdeHome(null)

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
    const mod = await loadopenfdeHome()
    mod.initializeopenfdeHome(null)
    vi.mocked(mkdirSync).mockClear()

    const dirs = mod.getAgentMemoryDirs('skill:default')

    expect(dirs.block).toBe(
      join('/mock-home', '.openfde', 'memory', 'skill_default', 'block'),
    )
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(dirs.block, {
      recursive: true,
    })
    expect(vi.mocked(mkdirSync)).not.toHaveBeenCalledWith(
      join('/mock-home', '.openfde', 'channels', 'whatsapp-auth'),
      expect.anything(),
    )
  })

  it('does not redirect app db, config, memory, or logs paths into channels/', async () => {
    const mod = await loadopenfdeHome()
    mod.initializeopenfdeHome(null)
    vi.mocked(mkdirSync).mockClear()

    mod.getopenfdeDbPath()
    mod.getopenfdeConfigDir()
    mod.getopenfdeMemoryVectorsDbPath()
    mod.getopenfdeLogsDir()

    const channelRedirect = join(
      '/mock-home',
      '.openfde',
      'channels',
      'whatsapp-auth',
    )
    for (const call of vi.mocked(mkdirSync).mock.calls) {
      expect(call[0]).not.toBe(channelRedirect)
    }
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join('/mock-home', '.openfde', 'db'),
      { recursive: true },
    )
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join('/mock-home', '.openfde', 'memory'),
      { recursive: true },
    )
  })

  it('creates channel data dirs under channels/', async () => {
    const mod = await loadopenfdeHome()
    mod.initializeopenfdeHome(null)
    vi.mocked(mkdirSync).mockClear()

    mod.getopenfdeWhatsAppAuthDir()

    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      join('/mock-home', '.openfde', 'channels', 'whatsapp-auth'),
      { recursive: true },
    )
  })

  it('guessDefaultElectronUserData covers platforms', async () => {
    const mod = await loadopenfdeHome()
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
    const mod = await loadopenfdeHome()
    mod.getopenfdeHome()
    expect(createRequireMock).toHaveBeenCalled()
  })
})
