'use strict'

import { app, session } from 'electron'
import { configureAppBranding, loadDockIcon } from './config/app-icons'
import { initStaticPaths } from './config/static-path'
import { resolveAppRoot } from './config/app-paths'

configureAppBranding()
initStaticPaths()

import { initializeopenfdeHome } from '@config/openfde-home'
import { isPackagedApp } from './config/app-paths'
import { clearSkillModuleCache, loadToolSetTools } from '@main/skills/skill-module-loader'

initializeopenfdeHome(app)
// Dev-only: drop stale esbuild bundles when source changes frequently.
if (!isPackagedApp()) {
  clearSkillModuleCache()
}
import InitWindow from './services/window-manager'
import { useDisableButton } from './hooks/disable-button-hook'
import { useProcessException } from '@main/hooks/exception-hook'
import { useMenu } from '@main/hooks/menu-hook'
import { useMainDefaultIpc } from './services/ipc-main'
import { createTray } from './services/tray-manager'
import { getWhatsAppChannelManager } from './channels/whatsapp/manager'
import { getTelegramChannelManager } from './channels/telegram/manager'
import { getDiscordChannelManager } from './channels/discord/manager'
import { getWeChatChannelManager } from './channels/wechat/manager'
import { getSlackChannelManager } from './channels/slack/manager'
import { getSchedulerManager } from './services/scheduler-manager'
import { registerMainProcessSupportHandlers } from './services/support-event-store'
import { getLspManager, initBundledLspBin } from './agent/lsp'
import { createLogger } from './logger'

let isQuiting = false
const log = createLogger('app')

async function onAppReady() {
  log.info('App ready; initializing desktop services')

  try {
    await loadToolSetTools()
  } catch (err) {
    log.error('toolSet failed to load during startup; exiting', { err })
    app.exit(1)
    return
  }

  const { disableF12 } = useDisableButton()
  const { renderProcessGone } = useProcessException()
  const { defaultIpc } = useMainDefaultIpc()
  const { createMenu } = useMenu()
  registerMainProcessSupportHandlers()
  disableF12()
  renderProcessGone()
  defaultIpc()
  createMenu()

  // Publish the app-bundled node_modules/.bin so language servers
  // (typescript-language-server, pyright) resolve in any workspace.
  // Best-effort — must never crash startup.
  try {
    let appPath = ''
    try {
      appPath = app.getAppPath()
    } catch {
      /* getAppPath unavailable (e.g. tests) */
    }
    const lspBin = initBundledLspBin([resolveAppRoot(), appPath, process.cwd()])
    log.info('LSP bundled bin resolved', { lspBin })
  } catch (err) {
    log.warn('LSP bundled bin init failed', { err })
  }

  // Set dock icon (macOS) — overrides default Electron icon in dev.
  if (process.platform === 'darwin' && app.dock) {
    const icon = loadDockIcon()
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon)
    }
  }

  const initWindow = new InitWindow()
  initWindow.initWindow()
  createTray(() => initWindow.mainWindow)
  log.info('Main window and tray initialized')

  // Auto-start WhatsApp channel so it's ready (or showing QR) before the user opens settings
  void getWhatsAppChannelManager().ensureStarted()
  log.info('WhatsApp channel manager startup requested')

  // Auto-start Telegram bot if a token is configured
  void getTelegramChannelManager().ensureStarted()
  log.info('Telegram channel manager startup requested')

  // Auto-start Discord bot if a token is configured
  void getDiscordChannelManager().ensureStarted()
  log.info('Discord channel manager startup requested')

  // Auto-start WeChat Work bot if credentials are configured
  void getWeChatChannelManager().ensureStarted()
  log.info('WeChat channel manager startup requested')

  // Auto-start Slack bot if tokens are configured
  void getSlackChannelManager().ensureStarted()
  log.info('Slack channel manager startup requested')

  // Run scheduler jobs in the main process.
  getSchedulerManager().ensureStarted()
  log.info('Scheduler manager startup requested')

  if (process.env.NODE_ENV === 'development') {
    const { VUEJS_DEVTOOLS } = require('electron-devtools-vendor')
    session.defaultSession.loadExtension(VUEJS_DEVTOOLS, {
      allowFileAccess: true,
    })
    log.info('Installed vue-devtools extension')
  }
}

app.whenReady().then(onAppReady)
// Required for Electron 9.x to disable CORS
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

app.on('before-quit', () => {
  isQuiting = true
  // main window close handler checks app.isQuiting (see window-manager)
  Object.assign(app, { isQuiting: true })
  // Kill any language servers spawned for workspace diagnostics.
  try {
    getLspManager().closeAll()
  } catch (err) {
    log.warn('LSP cleanup on quit failed', { err })
  }
})

app.on('window-all-closed', () => {
  // Only quit when all windows are truly closed (not just hidden)
  if (isQuiting) app.quit()
})
app.on('browser-window-created', () => {
  log.info('Browser window created')
})

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.removeAsDefaultProtocolClient('electron-vue-template')
  }
} else {
  app.setAsDefaultProtocolClient('electron-vue-template')
}
