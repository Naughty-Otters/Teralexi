import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import type { AppUpdateMessage, AppUpdatePhase } from '@shared/app-update'
import { resolveAppVersion } from '@main/config/app-version'
import { getOpenFdeDesktopReleasesFeedUrl } from './openfde-platform-config'
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
  const feedUrl = getOpenFdeDesktopReleasesFeedUrl()
  if (!feedUrl) {
    return {
      ok: false,
      error:
        'Set BASE_API in env (maps to app.base.apiUrl) to enable updates.',
    }
  }

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedUrl,
  })
  autoUpdater.requestHeaders = {}

  return { ok: true, feedUrl }
}

/** Packaged builds always; unpackaged dev may check against localhost feeds only. */
export function canRunDesktopUpdateCheck(): boolean {
  if (app.isPackaged) return true
  const feedUrl = getOpenFdeDesktopReleasesFeedUrl()
  if (!feedUrl) return false
  try {
    const host = new URL(feedUrl).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

function desktopUpdateCheckBlockedMessage(): string {
  if (app.isPackaged) {
    return 'Set BASE_API in env (maps to app.base.apiUrl) to enable updates.'
  }
  return 'Updates from source are disabled unless BASE_API points at localhost (for local feed testing). Use a packaged build for production feeds.'
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
    if (!canRunDesktopUpdateCheck()) {
      log.info('Skipping update check', { isPackaged: app.isPackaged })
      this.mainWindow = mainWindow
      this.send(mainWindow, 'not-available', {
        error: desktopUpdateCheckBlockedMessage(),
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
  if (!canRunDesktopUpdateCheck()) return

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
