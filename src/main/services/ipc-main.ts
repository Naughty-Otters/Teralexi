// TODO: Split ipc-main.ts into multiple files? Via abstract inheritance or registered callbacks?
import { ipcMain } from 'electron'
import { IpcMainHandleClass } from './ipc-main-handle'
import { createLogger, instrumentObjectMethods } from '@main/logger'

const log = createLogger('ipc.main')

export const useMainDefaultIpc = () => {
  return instrumentObjectMethods({
    defaultIpc: () => {
      const ipcMainHandle = instrumentObjectMethods(
        new IpcMainHandleClass() as unknown as Record<PropertyKey, unknown>,
        log.child({ scope: 'ipc.main.handlers' }),
      )
      const channels = Object.keys(ipcMainHandle)
      log.info('Registering main IPC handlers', {
        handlerCount: channels.length,
        channels,
      })
      if (channels.length === 0) {
        log.error('No IPC handlers found on IpcMainHandleClass')
      }
      Object.entries(ipcMainHandle).forEach(
        ([ipcChannelName, ipcListener]: [string, () => void]) => {
          if (typeof ipcListener === 'function') {
            ipcMain.handle(ipcChannelName, ipcListener)
            log.info('Mounted IPC handler', { channel: ipcChannelName })
          } else {
            log.warn('Skipping non-function IPC handler', {
              channel: ipcChannelName,
            })
          }
        },
      )
    },
  }, log.child({ scope: 'ipc.main.factory' }))
}
