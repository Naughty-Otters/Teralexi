import { describe, expect, it, vi, beforeEach } from 'vitest'

const { on, checkForUpdates, downloadUpdate, quitAndInstall } = vi.hoisted(() => ({
  on: vi.fn(),
  checkForUpdates: vi.fn(() => Promise.resolve()),
  downloadUpdate: vi.fn(() => Promise.resolve()),
  quitAndInstall: vi.fn(),
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    autoDownload: false,
    autoInstallOnAppQuit: true,
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

import { app } from 'electron'
import { webContentSend } from './web-content-send'
import { AppUpdateManager, getAppUpdateManager } from './check-update'

describe('check-update', () => {
  beforeEach(() => {
    vi.mocked(checkForUpdates).mockClear()
    vi.mocked(downloadUpdate).mockClear()
    vi.mocked(quitAndInstall).mockClear()
    vi.mocked(webContentSend.updateMsg).mockClear()
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
  })

  it('registers autoUpdater listeners and checks for updates when packaged', () => {
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = new AppUpdateManager()
    updater.checkUpdate(mainWindow)
    expect(checkForUpdates).toHaveBeenCalled()
    expect(on).toHaveBeenCalled()
  })

  it('skips update check when running unpackaged', () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = new AppUpdateManager()
    updater.checkUpdate(mainWindow)
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

  it('downloads updates and can quit to install', () => {
    const mainWindow = {
      webContents: {},
      isDestroyed: () => false,
    } as Electron.BrowserWindow
    const updater = getAppUpdateManager()
    updater.downloadUpdate(mainWindow)
    expect(downloadUpdate).toHaveBeenCalled()
    updater.quitAndInstall()
    expect(quitAndInstall).toHaveBeenCalled()
  })
})
