import { join, resolve } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join as joinPath, mockTesterHomedir, p } from '@test-paths'

const { on, checkForUpdates, downloadUpdate, quitAndInstall, setFeedURL } =
  vi.hoisted(() => ({
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve({})),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn(),
  }))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    setFeedURL,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    requestHeaders: {},
    forceDevUpdateConfig: false,
    currentVersion: null,
    updateConfigPath: '',
  },
}))

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '0.0.1'),
    isPackaged: true,
  },
  BrowserWindow: vi.fn(),
}))

vi.mock('@main/config/app-version', () => ({
  resolveAppVersion: vi.fn(() => '0.0.1'),
}))

vi.mock('./web-content-send', () => ({
  webContentSend: { updateMsg: vi.fn() },
}))

vi.mock('./openfde-platform-config', () => ({
  getOpenFdeDesktopReleasesFeedUrl: vi.fn(
    () => 'http://127.0.0.1:8000/desktop/releases/stable/',
  ),
  getOpenFdeDesktopForceDevUpdateConfig: vi.fn(() => false),
}))

vi.mock('@config/openfde-home', () => ({
  getopenfdeConfigDir: vi.fn(() =>
    joinPath(mockTesterHomedir(), '.openfde', 'config'),
  ),
}))

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import { mkdirSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  getOpenFdeDesktopForceDevUpdateConfig,
  getOpenFdeDesktopReleasesFeedUrl,
} from './openfde-platform-config'
import { webContentSend } from './web-content-send'
import {
  AppUpdateManager,
  canRunDesktopUpdateCheck,
  ensureDevAppUpdateConfig,
  getAppUpdateManager,
  prepareDesktopAutoUpdater,
} from './check-update'

describe('check-update', () => {
  beforeEach(() => {
    vi.mocked(checkForUpdates).mockClear()
    vi.mocked(downloadUpdate).mockClear()
    vi.mocked(quitAndInstall).mockClear()
    vi.mocked(setFeedURL).mockClear()
    vi.mocked(webContentSend.updateMsg).mockClear()
    vi.mocked(getOpenFdeDesktopForceDevUpdateConfig).mockReturnValue(false)
    vi.mocked(getOpenFdeDesktopReleasesFeedUrl).mockReturnValue(
      'http://127.0.0.1:8000/desktop/releases/stable/',
    )
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
    autoUpdater.requestHeaders = { Authorization: 'Bearer stale' }
  })

  it('prepareDesktopAutoUpdater configures generic feed without auth headers', async () => {
    const prepared = await prepareDesktopAutoUpdater()
    expect(prepared.ok).toBe(true)
    if (prepared.ok) {
      expect(prepared.feedUrl).toBe(
        'http://127.0.0.1:8000/desktop/releases/stable/',
      )
    }
    expect(setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'http://127.0.0.1:8000/desktop/releases/stable/',
    })
    expect(autoUpdater.requestHeaders).toEqual({})
  })

  it('prepareDesktopAutoUpdater requires BASE_API feed URL', async () => {
    vi.mocked(getOpenFdeDesktopReleasesFeedUrl).mockReturnValue('')
    const prepared = await prepareDesktopAutoUpdater()
    expect(prepared.ok).toBe(false)
    if (!prepared.ok) {
      expect(prepared.error).toMatch(/BASE_API/i)
    }
  })

  it('prepareDesktopAutoUpdater enables dev update config when DESKTOP_UPDATE_FORCE_DEV is set', async () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    vi.mocked(getOpenFdeDesktopForceDevUpdateConfig).mockReturnValue(true)
    await prepareDesktopAutoUpdater()
    expect(autoUpdater.forceDevUpdateConfig).toBe(true)
    const configPath = joinPath(mockTesterHomedir(), '.openfde', 'config', 'dev-app-update.yml')
    expect(writeFileSync).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining('url: http://127.0.0.1:8000/desktop/releases/stable/'),
      'utf-8',
    )
    expect(autoUpdater.updateConfigPath).toBe(configPath)
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
    await prepareDesktopAutoUpdater()
    expect(autoUpdater.forceDevUpdateConfig).toBe(false)
  })

  it('ensureDevAppUpdateConfig writes updater cache metadata for dev downloads', () => {
    const configDir = joinPath(mockTesterHomedir(), '.openfde', 'config')
    const expectedPath = join(configDir, 'dev-app-update.yml')
    const returnedPath = ensureDevAppUpdateConfig(
      'http://127.0.0.1:8000/desktop/releases/stable',
    )
    expect(p(returnedPath)).toBe(p(expectedPath))
    expect(mkdirSync).toHaveBeenCalledWith(configDir, {
      recursive: true,
    })
    expect(writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      [
        'provider: generic',
        'url: http://127.0.0.1:8000/desktop/releases/stable/',
        'updaterCacheDirName: openfde-updater',
        '',
      ].join('\n'),
      'utf-8',
    )
    expect(autoUpdater.updateConfigPath).toBe(expectedPath)
  })

  it('sends error when electron-updater returns null', async () => {
    vi.mocked(checkForUpdates).mockResolvedValueOnce(null)
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = new AppUpdateManager()
    await updater.checkUpdate(mainWindow)
    expect(webContentSend.updateMsg).toHaveBeenCalledWith(
      mainWindow.webContents,
      expect.objectContaining({ phase: 'error' }),
    )
  })

  it('registers autoUpdater listeners and checks for updates when packaged', async () => {
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = new AppUpdateManager()
    await updater.checkUpdate(mainWindow)
    expect(setFeedURL).toHaveBeenCalled()
    expect(checkForUpdates).toHaveBeenCalled()
    expect(on).toHaveBeenCalled()
  })

  it('canRunDesktopUpdateCheck allows unpackaged dev when force-dev flag is enabled', () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    vi.mocked(getOpenFdeDesktopForceDevUpdateConfig).mockReturnValue(true)
    expect(canRunDesktopUpdateCheck()).toBe(true)
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
  })

  it('canRunDesktopUpdateCheck blocks unpackaged dev without force-dev flag', () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    vi.mocked(getOpenFdeDesktopForceDevUpdateConfig).mockReturnValue(false)
    expect(canRunDesktopUpdateCheck()).toBe(false)
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
  })

  it('skips update check when running unpackaged without force-dev flag', async () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    vi.mocked(getOpenFdeDesktopForceDevUpdateConfig).mockReturnValue(false)
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = new AppUpdateManager()
    await updater.checkUpdate(mainWindow)
    expect(checkForUpdates).not.toHaveBeenCalled()
    expect(webContentSend.updateMsg).toHaveBeenCalledWith(
      mainWindow.webContents,
      expect.objectContaining({ phase: 'not-available' }),
    )
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
  })

  it('sends typed update messages', () => {
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = new AppUpdateManager()
    updater.send(mainWindow, 'available', {
      newVersion: '0.0.2',
      releaseNotes: 'Bug fixes',
    })
    expect(webContentSend.updateMsg).toHaveBeenCalledWith(mainWindow.webContents, {
      phase: 'available',
      currentVersion: '0.0.1',
      newVersion: '0.0.2',
      releaseNotes: 'Bug fixes',
    })
  })

  it('downloads updates and can quit to install', async () => {
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = getAppUpdateManager()
    await updater.downloadUpdate(mainWindow)
    expect(setFeedURL).toHaveBeenCalled()
    expect(downloadUpdate).toHaveBeenCalled()
    updater.quitAndInstall()
    expect(quitAndInstall).toHaveBeenCalled()
  })
})
