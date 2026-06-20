import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { arch, platform } from 'os'
import { stat, remove } from 'fs-extra'
import packageInfo from '../../../package.json'
import { webContentSend } from './web-content-send'
import { createLogger, instrumentInstanceMethods } from '@main/logger'

/**
 *
 * @description
 * @returns {void} Download class
 * @param {mainWindow} Main window
 * @param {downloadUrl} Download URL; uses preset baseUrl if not provided
 * @author Sky
 * @date 2020-08-12
 */

const log = createLogger('services.download-file')

class Main {
  public mainWindow: BrowserWindow | null = null
  public downloadUrl: string = ''
  public version: string = packageInfo.version
  public baseUrl: string = ''
  public Sysarch: string = arch().includes('64') ? 'win64' : 'win32'
  public HistoryFilePath = join(
    app.getPath('downloads'),
    platform().includes('win32')
      ? `electron_${this.version}_${this.Sysarch}.exe`
      : `electron_${this.version}_mac.dmg`,
  )
  private isDownloadListenerRegistered = false // New flag

  constructor(mainWindow: BrowserWindow, downloadUrl?: string) {
    instrumentInstanceMethods(this, log)
    this.mainWindow = mainWindow
    this.downloadUrl =
      downloadUrl || platform().includes('win32')
        ? this.baseUrl +
          `electron_${this.version}_${this.Sysarch}.exe?${new Date().getTime()}`
        : this.baseUrl +
          `electron_${this.version}_mac.dmg?${new Date().getTime()}`

    // Register will-download event only once
    if (!this.isDownloadListenerRegistered && this.mainWindow) {
      this.mainWindow.webContents.session.on(
        'will-download',
        (event: any, item: any, webContents: any) => {
          const filePath = join(app.getPath('downloads'), item.getFilename())
          item.setSavePath(filePath)
          item.on('updated', (event: any, state: String) => {
            switch (state) {
              case 'progressing':
                webContentSend.DownloadProgress(
                  this.mainWindow!.webContents,
                  Number(
                    (
                      (item.getReceivedBytes() / item.getTotalBytes()) *
                      100
                    ).toFixed(0),
                  ),
                )
                break
              default:
                webContentSend.DownloadError(this.mainWindow!.webContents, true)
                dialog.showErrorBox(
                  'Download error',
                  'Download failed due to network or unknown error',
                )
                break
            }
          })
          item.once('done', (event: any, state: String) => {
            switch (state) {
              case 'completed':
                const data = {
                  filePath,
                }
                webContentSend.DownloadDone(this.mainWindow!.webContents, data)
                break
              case 'interrupted':
                webContentSend.DownloadError(this.mainWindow!.webContents, true)
                dialog.showErrorBox(
                  'Download error',
                  'Download failed due to network or unknown error.',
                )
                break
              default:
                break
            }
          })
        },
      )
      this.isDownloadListenerRegistered = true
    }
  }

  start() {
    log.info('Starting file download', {
      downloadUrl: this.downloadUrl,
      historyFilePath: this.HistoryFilePath,
    })
    // Check for existing file with same name before updating; delete if found, otherwise start download
    stat(this.HistoryFilePath, async (err, stats) => {
      try {
        if (stats) {
          await remove(this.HistoryFilePath)
        }
        this.mainWindow!.webContents.downloadURL(this.downloadUrl)
      } catch (error) {
        log.error('Download start failed', { err: error })
      }
    })
  }
}

export default Main
