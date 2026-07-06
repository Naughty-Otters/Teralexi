import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import { getTeralexiConfigDir } from '@config/teralexi-home'
import type { AppUpdateMessage, AppUpdatePhase } from '@shared/app-update'
import { resolveAppVersion } from '@main/config/app-version'
import {
  getTeralexiDesktopForceDevUpdateConfig,
  getTeralexiDesktopReleasesFeedUrl,
} from './teralexi-platform-config'
import { webContentSend } from './web-content-send'
import { createLogger, instrumentInstanceMethods } from '@main/logger'

const log = createLogger('services.check-update')

const STARTUP_CHECK_DELAY_MS = 30_000
const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000
const UPDATER_CACHE_DIR_NAME = 'teralexi-updater'
const DEV_APP_UPDATE_CONFIG_FILENAME = 'dev-app-update.yml'

let managerInstance: AppUpdateManager | null = null
let periodicTimer: ReturnType<typeof setInterval> | null = null

export type PrepareDesktopAutoUpdaterResult =
  | { ok: true; feedUrl: string }
  | { ok: false; error: string }

export async function prepareDesktopAutoUpdater(): Promise<PrepareDesktopAutoUpdaterResult> {
  const feedUrl = getTeralexiDesktopReleasesFeedUrl()
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
  configureDesktopAutoUpdaterRuntime(feedUrl)

  return { ok: true, feedUrl }
}

/** electron-updater reads dev-app-update.yml for updaterCacheDirName when downloading in dev. */
export function ensureDevAppUpdateConfig(feedUrl: string): string {
  const configDir = getTeralexiConfigDir()
  mkdirSync(configDir, { recursive: true })
  const configPath = join(configDir, DEV_APP_UPDATE_CONFIG_FILENAME)
  const normalizedUrl = feedUrl.endsWith('/') ? feedUrl : `${feedUrl}/`
  const yaml = [
    'provider: generic',
    `url: ${normalizedUrl}`,
    `updaterCacheDirName: ${UPDATER_CACHE_DIR_NAME}`,
    '',
  ].join('\n')
  writeFileSync(configPath, yaml, 'utf-8')
  autoUpdater.updateConfigPath = configPath
  return configPath
}

/** Unpackaged dev: electron-updater is disabled unless forceDevUpdateConfig is set. */
function configureDesktopAutoUpdaterRuntime(feedUrl: string): void {
  if (app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = false
    return
  }

  const forceDev = getTeralexiDesktopForceDevUpdateConfig()
  autoUpdater.forceDevUpdateConfig = forceDev
  if (!forceDev) return

  ensureDevAppUpdateConfig(feedUrl)

  const productVersion = resolveAppVersion()
  const parsed = semver.parse(productVersion)
  if (parsed) {
    // Updater reads app.getVersion() (Electron runtime in dev); use product semver instead.
    ;(autoUpdater as { currentVersion: semver.SemVer }).currentVersion = parsed
  }
}

/** Packaged builds always; unpackaged dev requires explicit DESKTOP_UPDATE_FORCE_DEV. */
export function canRunDesktopUpdateCheck(): boolean {
  if (app.isPackaged) return true
  if (!getTeralexiDesktopForceDevUpdateConfig()) return false
  return Boolean(getTeralexiDesktopReleasesFeedUrl())
}

function desktopUpdateCheckBlockedMessage(): string {
  if (app.isPackaged) {
    return 'Set BASE_API in env (maps to app.base.apiUrl) to enable updates.'
  }
  return 'Updates from source are disabled. Set DESKTOP_UPDATE_FORCE_DEV=true in env/.dev.env (maps to app.desktop.forceDevUpdateConfig) to test updates locally.'
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
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result === null) {
        log.warn('Update check skipped by electron-updater')
        this.send(mainWindow, 'error', {
          error: 'Update check is unavailable in this environment.',
        })
      }
    } catch (err) {
      log.error('Update check failed', { err })
      this.send(mainWindow, 'error', {
        error: err instanceof Error ? err.message : 'Update check failed.',
      })
    }
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
