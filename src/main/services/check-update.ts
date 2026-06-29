import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import type { AppUpdateMessage, AppUpdatePhase } from '@shared/app-update'
import { resolveAppVersion } from '@main/config/app-version'
import { getOpenFdeServerAccessToken } from './openfde-server-auth'
import {
  getOpenFdeBaseApiUrl,
  getOpenFdeDesktopReleasesFeedUrl,
} from './openfde-platform-config'
import { webContentSend } from './web-content-send'
import { createLogger, instrumentInstanceMethods } from '@main/logger'

const log = createLogger('services.check-update')

const STARTUP_CHECK_DELAY_MS = 30_000
const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000

let managerInstance: AppUpdateManager | null = null
let periodicTimer: ReturnType<typeof setInterval> | null = null

export type PrepareDesktopAutoUpdaterResult =
  | { ok: true; feedUrl: string }
  | { ok: false; error: string }

export async function prepareDesktopAutoUpdater(): Promise<PrepareDesktopAutoUpdaterResult> {
  const baseApiUrl = getOpenFdeBaseApiUrl()
  if (!baseApiUrl) {
    return {
      ok: false,
      error:
        'Set BASE_API in env (maps to app.base.apiUrl) to enable authenticated updates.',
    }
  }

  const feedUrl = getOpenFdeDesktopReleasesFeedUrl()
  if (!feedUrl) {
    return {
      ok: false,
      error: 'Desktop release feed URL is not configured.',
    }
  }

  const bearerToken = await getOpenFdeServerAccessToken(baseApiUrl)
  if (!bearerToken) {
    return {
      ok: false,
      error:
        'Sign in with your OpenFDE Google account before checking for updates.',
    }
  }

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedUrl,
  })
  autoUpdater.requestHeaders = {
    Authorization: `Bearer ${bearerToken}`,
  }

  return { ok: true, feedUrl }
}

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

  async checkUpdate(mainWindow: BrowserWindow) {
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

    const prepared = await prepareDesktopAutoUpdater()
    if (!prepared.ok) {
      this.send(mainWindow, 'error', { error: prepared.error })
      return
    }

    log.info('Checking desktop updates', { feedUrl: prepared.feedUrl })
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Update check failed', { err })
      this.send(mainWindow, 'error', {
        error: err instanceof Error ? err.message : 'Update check failed.',
      })
    })
  }

  async downloadUpdate(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.ensureListeners()

    const prepared = await prepareDesktopAutoUpdater()
    if (!prepared.ok) {
      this.send(mainWindow, 'error', { error: prepared.error })
      return
    }

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

export async function scheduleStartupUpdateCheck(mainWindow: BrowserWindow) {
  if (!app.isPackaged) return

  setTimeout(async () => {
    if (mainWindow.isDestroyed()) return
    const prepared = await prepareDesktopAutoUpdater()
    if (!prepared.ok) {
      log.info('Skipping background update check', { reason: prepared.error })
      return
    }
    getAppUpdateManager().checkUpdate(mainWindow)
  }, STARTUP_CHECK_DELAY_MS)

  if (periodicTimer) clearInterval(periodicTimer)
  periodicTimer = setInterval(async () => {
    if (mainWindow.isDestroyed()) return
    const prepared = await prepareDesktopAutoUpdater()
    if (!prepared.ok) return
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
