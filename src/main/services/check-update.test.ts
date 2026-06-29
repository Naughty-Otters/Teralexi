import { describe, expect, it, vi, beforeEach } from 'vitest'

const { on, checkForUpdates, downloadUpdate, quitAndInstall, setFeedURL } =
  vi.hoisted(() => ({
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve()),
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
  getOpenFdeBaseApiUrl: vi.fn(() => 'http://127.0.0.1:8000'),
  getOpenFdeDesktopReleasesFeedUrl: vi.fn(
    () => 'http://127.0.0.1:8000/desktop/releases/stable/',
  ),
}))

vi.mock('./openfde-server-auth', () => ({
  getOpenFdeServerAccessToken: vi.fn(() => Promise.resolve('server-token')),
}))

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getOpenFdeServerAccessToken } from './openfde-server-auth'
import { getOpenFdeBaseApiUrl } from './openfde-platform-config'
import { webContentSend } from './web-content-send'
import {
  AppUpdateManager,
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
    vi.mocked(getOpenFdeServerAccessToken).mockResolvedValue('server-token')
    vi.mocked(getOpenFdeBaseApiUrl).mockReturnValue('http://127.0.0.1:8000')
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
    autoUpdater.requestHeaders = {}
  })

  it('prepareDesktopAutoUpdater configures generic feed and auth headers', async () => {
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
    expect(autoUpdater.requestHeaders).toEqual({
      Authorization: 'Bearer server-token',
    })
  })

  it('prepareDesktopAutoUpdater requires sign-in', async () => {
    vi.mocked(getOpenFdeServerAccessToken).mockResolvedValue(null)
    const prepared = await prepareDesktopAutoUpdater()
    expect(prepared.ok).toBe(false)
    if (!prepared.ok) {
      expect(prepared.error).toMatch(/Sign in/i)
    }
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

  it('skips update check when running unpackaged', async () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
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
