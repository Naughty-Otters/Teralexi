import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import type { AppUpdateMessage, AppUpdatePhase } from '@shared/app-update'
import { resolveAppVersion } from '@main/config/app-version'
import { webContentSend } from './web-content-send'
import { createLogger, instrumentInstanceMethods } from '@main/logger'

const log = createLogger('services.check-update')

const STARTUP_CHECK_DELAY_MS = 30_000
const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000

let managerInstance: AppUpdateManager | null = null
let periodicTimer: ReturnType<typeof setInterval> | null = null

export class AppUpdateManager {
  public mainWindow: BrowserWindow | null = null
  private listenersRegistered = false
  private lastMessage: AppUpdateMessage | null = null

  constructor() {
    instrumentInstanceMethods(this, log)
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
  }

  private ensureListeners() {
    if (this.listenersRegistered) return
    this.listenersRegistered = true

    autoUpdater.on('error', (err) => {
      log.error('Update error', { err })
      const message =
        err.message.includes('sha512 checksum mismatch')
          ? 'Update file failed integrity check.'
          : err.message || 'Update check failed.'
      this.send(this.mainWindow, 'error', { error: message })
    })

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates')
      this.send(this.mainWindow, 'checking')
    })

    autoUpdater.on('update-available', (info) => {
      log.info('Update available', { version: info.version })
      this.send(this.mainWindow, 'available', {
        newVersion: info.version,
        releaseNotes: formatReleaseNotes(info.releaseNotes),
      })
    })

    autoUpdater.on('update-not-available', () => {
      log.info('No update available')
      this.send(this.mainWindow, 'not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      this.send(this.mainWindow, 'downloading', {
        percent: Number(progress.percent.toFixed(1)),
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded', { version: info.version })
      this.send(this.mainWindow, 'downloaded', {
        newVersion: info.version,
        releaseNotes: formatReleaseNotes(info.releaseNotes),
      })
    })
  }

  send(
    mainWindow: BrowserWindow | null | undefined,
    phase: AppUpdatePhase,
    extra: Partial<AppUpdateMessage> = {},
  ) {
    const payload: AppUpdateMessage = {
      phase,
      currentVersion: resolveAppVersion(),
      ...extra,
    }
    this.lastMessage = payload
    if (mainWindow && !mainWindow.isDestroyed()) {
      webContentSend.updateMsg(mainWindow.webContents, payload)
    }
  }

  getLastMessage(): AppUpdateMessage | null {
    return this.lastMessage
  }

  checkUpdate(mainWindow: BrowserWindow) {
    if (!app.isPackaged) {
      log.info('Skipping update check in unpackaged app')
      this.mainWindow = mainWindow
      this.send(mainWindow, 'not-available', {
        error: 'Updates are only available in installed builds.',
      })
      return
    }

    this.mainWindow = mainWindow
    this.ensureListeners()
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Update check failed', { err })
      this.send(mainWindow, 'error', {
        error: err instanceof Error ? err.message : 'Update check failed.',
      })
    })
  }

  downloadUpdate(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.ensureListeners()
    autoUpdater.downloadUpdate().catch((err) => {
      log.error('Update download failed', { err })
      this.send(mainWindow, 'error', {
        error: err instanceof Error ? err.message : 'Download failed.',
      })
    })
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall()
  }
}

export function getAppUpdateManager(): AppUpdateManager {
  if (!managerInstance) managerInstance = new AppUpdateManager()
  return managerInstance
}

export function scheduleStartupUpdateCheck(mainWindow: BrowserWindow) {
  if (!app.isPackaged) return

  setTimeout(() => {
    if (mainWindow.isDestroyed()) return
    getAppUpdateManager().checkUpdate(mainWindow)
  }, STARTUP_CHECK_DELAY_MS)

  if (periodicTimer) clearInterval(periodicTimer)
  periodicTimer = setInterval(() => {
    if (mainWindow.isDestroyed()) return
    getAppUpdateManager().checkUpdate(mainWindow)
  }, PERIODIC_CHECK_MS)
}

function formatReleaseNotes(
  notes: string | ReleaseNoteInfo[] | null | undefined,
): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes.trim() || undefined
  const joined = notes
    .map((entry) => entry.note?.trim())
    .filter(Boolean)
    .join('\n')
  return joined || undefined
}

type ReleaseNoteInfo = { note?: string | null }

/** @deprecated Use AppUpdateManager */
export default AppUpdateManager
