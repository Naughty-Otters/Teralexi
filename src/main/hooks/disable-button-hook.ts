import { globalShortcut } from 'electron'
import { createLogger, instrumentObjectMethods } from '@main/logger'

const log = createLogger('hooks.disable-button')

export const useDisableButton = () => {
  const disableF12 = () => {
    globalShortcut.register('f12', () => {
      log.info('User attempted to open devtools')
    })
  }
  return instrumentObjectMethods({
    disableF12,
  }, log.child({ scope: 'hooks.disable-button.factory' }))
}
