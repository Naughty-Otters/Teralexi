'use strict'

import { app, dialog } from 'electron'
import config from '@config/index'
import { isTeralexiTestMode } from '@config/test-mode'
import { configureAppBranding } from './config/app-icons'

configureAppBranding()

import { initializeTeralexiHome } from '@config/teralexi-home'
import { ensureClientId } from '@main/services/client-identity'
import { createBootstrapSplash } from './bootstrap-splash'
import { createLogger } from './logger'
import {
  registerInternalTeralexiProtocolHandler,
  registerTeralexiProtocolClient,
  registerTeralexiProtocolHandlers,
  registerTeralexiProtocolScheme,
  requestTeralexiSingleInstanceLock,
} from './services/teralexi-protocol-handler'

const log = createLogger('app.bootstrap')

initializeTeralexiHome(app)
ensureClientId()

// Before ready: claim teralexi:// inside Chromium for unpackaged/dev login windows.
registerTeralexiProtocolScheme()

if (!requestTeralexiSingleInstanceLock()) {
  app.quit()
} else {
  registerTeralexiProtocolClient()
  registerTeralexiProtocolHandlers()
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

async function onBootstrapReady(): Promise<void> {
  try {
    log.info('Bootstrap ready')
    registerInternalTeralexiProtocolHandler()

    const useSplash = config.UseStartupChart && !isTeralexiTestMode()
    const splashWindow = useSplash ? createBootstrapSplash() : undefined

    // Let the splash window paint before loading the heavy main-app bundle.
    await yieldToEventLoop()
    await yieldToEventLoop()

    log.info('Loading main application module')
    const { startMainApp } = await import('./main-app.js')
    await startMainApp({ splashWindow })
  } catch (err) {
    log.error('Bootstrap failed during startup', { err })
    dialog.showErrorBox(
      'Teralexi failed to start',
      'The application could not finish loading. Check the logs for details.',
    )
    app.exit(1)
  }
}

app.whenReady().then(onBootstrapReady)

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

app.on('before-quit', () => {
  Object.assign(app, { isQuiting: true })
  void import('./main-app.js')
    .then(({ shutdownMainApp }) => shutdownMainApp())
    .catch(() => {})
})

app.on('window-all-closed', () => {
  if ((app as Electron.App & { isQuiting?: boolean }).isQuiting) {
    app.quit()
  }
})
