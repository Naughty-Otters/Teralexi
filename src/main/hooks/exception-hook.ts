import { WebContents, app, dialog } from 'electron'
import type {
  Details,
  RenderProcessGoneDetails,
  Event,
  BrowserWindow,
} from 'electron'
import { createLogger, instrumentObjectMethods } from '@main/logger'

export interface UseProcessExceptionRetrun {
  /**
   * Emitted when the renderer process unexpectedly disappears. This is normally because it was crashed or killed.
   * If a listener is not passed in, it will default to following the crash prompt
   *
   * @see https://www.electronjs.org/docs/latest/api/app#event-render-process-gone
   */
  renderProcessGone: (
    listener?: (
      event: Event,
      webContents: WebContents,
      details: RenderProcessGoneDetails,
    ) => void,
  ) => void
  /**
   * Emitted when the child process unexpectedly disappears. This is normally because it was crashed or killed. It does not include renderer processes.
   * If a listener is not passed in, it will default to following the crash prompt
   *
   * @see https://www.electronjs.org/docs/latest/api/app#event-child-process-gone
   */
  childProcessGone: (
    window: BrowserWindow,
    listener?: (event: Event, details: Details) => void,
  ) => void

  mainWindowGone: (window: BrowserWindow, listener?: () => void) => void
}

const log = createLogger('hooks.exception')

export const useProcessException = (): UseProcessExceptionRetrun => {
  const renderProcessGone = (
    listener?: (
      event: Event,
      webContents: WebContents,
      details: RenderProcessGoneDetails,
    ) => void,
  ) => {
    app.on('render-process-gone', (event, webContents, details) => {
      log.error('Renderer process gone', {
        reason: details.reason,
        exitCode: details.exitCode,
      })
      if (listener) {
        listener(event, webContents, details)
        return
      }
      const message = {
        title: '',
        buttons: [],
        message: '',
      }
      switch (details.reason) {
        case 'crashed':
          message.title = 'Warning'
          message.buttons = ['OK', 'Quit']
          message.message = 'Renderer process crashed. Perform a soft restart?'
          break
        case 'killed':
          message.title = 'Warning'
          message.buttons = ['OK', 'Quit']
          message.message =
            'Renderer process was terminated due to unknown reason. Perform a soft restart?'
          break
        case 'oom':
          message.title = 'Warning'
          message.buttons = ['OK', 'Quit']
          message.message = 'Insufficient memory. Soft restart to free memory?'
          break

        default:
          break
      }
      dialog
        .showMessageBox({
          type: 'warning',
          title: message.title,
          buttons: message.buttons,
          message: message.message,
          noLink: true,
        })
        .then((res) => {
          if (res.response === 0) webContents.reload()
          else webContents.close()
        })
    })
  }
  const childProcessGone = (
    window: BrowserWindow,
    listener?: (event: Event, details: Details) => void,
  ) => {
    app.on('child-process-gone', (event, details) => {
      log.error('Child process gone', {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
      })
      if (listener) {
        listener(event, details)
        return
      }
      const message = {
        title: '',
        buttons: [],
        message: '',
      }
      switch (details.type) {
        case 'GPU':
          switch (details.reason) {
            case 'crashed':
              message.title = 'Warning'
              message.buttons = ['OK', 'Quit']
              message.message =
                'GPU process crashed. Disable hardware acceleration and restart?'
              break
            case 'killed':
              message.title = 'Warning'
              message.buttons = ['OK', 'Quit']
              message.message =
                'GPU process was unexpectedly terminated. Disable hardware acceleration and restart?'
              break
            default:
              break
          }
          break

        default:
          break
      }
      dialog
        .showMessageBox(window, {
          type: 'warning',
          title: message.title,
          buttons: message.buttons,
          message: message.message,
          noLink: true,
        })
        .then((res) => {
          // Disable GPU acceleration when the graphics card crashes.
          if (res.response === 0) {
            if (details.type === 'GPU') app.disableHardwareAcceleration()
            window.reload()
          } else {
            window.close()
          }
        })
    })
  }

  const mainWindowGone = (window: BrowserWindow, listener?: () => void) => {
    window.on('unresponsive', () => {
      log.error('Main window became unresponsive')
      if (listener) {
        listener()
        return
      }
      dialog
        .showMessageBox(window, {
          type: 'warning',
          title: 'Warning',
          buttons: ['Reload', 'Quit'],
          message: 'Renderer process is unresponsive. Wait for recovery?',
          noLink: true,
        })
        .then((res) => {
          if (res.response === 0) window!.reload()
          else window!.close()
        })
    })
  }
  return instrumentObjectMethods({
    renderProcessGone,
    childProcessGone,
    mainWindowGone,
  }, log.child({ scope: 'hooks.exception.factory' }))
}
