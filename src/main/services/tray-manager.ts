import { app, Menu, Tray } from 'electron'
import { loadTrayIcon, APP_DISPLAY_NAME } from '../config/app-icons'
import { createLogger, traceFunction } from '@main/logger'

let tray: Tray | null = null
const log = createLogger('services.tray-manager')

export const createTray = traceFunction(
  log,
  'createTray',
  (getMainWindow: () => Electron.BrowserWindow | null) => {
  const icon = loadTrayIcon()
  log.info('Creating tray icon from logo PNG', { isEmpty: icon.isEmpty() })

  tray = new Tray(icon)
  tray.setToolTip(APP_DISPLAY_NAME)

  const buildMenu = () => {
    const win = getMainWindow()
    const visible = win?.isVisible() ?? false

    return Menu.buildFromTemplate([
      {
        label: visible ? `Hide ${APP_DISPLAY_NAME}` : `Show ${APP_DISPLAY_NAME}`,
        click: () => {
          const w = getMainWindow()
          if (!w) return
          if (w.isVisible()) {
            w.hide()
          } else {
            w.show()
            w.focus()
          }
          tray?.setContextMenu(buildMenu())
        },
      },
      { type: 'separator' },
      {
        label: `Quit ${APP_DISPLAY_NAME}`,
        click: () => {
          app.quit()
        },
      },
    ])
  }

  tray.setContextMenu(buildMenu())

  tray.on('click', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isVisible()) {
      win.focus()
    } else {
      win.show()
      win.focus()
    }
    tray?.setContextMenu(buildMenu())
  })

  return tray
})

export const destroyTray = traceFunction(log, 'destroyTray', () => {
  tray?.destroy()
  tray = null
})
