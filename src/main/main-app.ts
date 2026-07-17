'use strict'

import { app, session, dialog, type BrowserWindow } from 'electron'
import { loadDockIcon } from './config/app-icons'
import { initStaticPaths } from './config/static-path'
import { resolveAppRoot, isPackagedApp } from './config/app-paths'
import { getTeralexiRulesDir } from '@config/teralexi-home'
import { isTeralexiTestMode } from '@config/test-mode'
import { setSystemPropValue } from '@config/system-prop'
import { seedBundledDefaultRulesIfMissing } from './config/bundled-default-rules'
import { clearSkillModuleCache, startToolSetCatalogLoad } from '@main/skills/skill-module-loader'
import { useDisableButton } from './hooks/disable-button-hook'
import { useProcessException } from '@main/hooks/exception-hook'
import { useMenu } from '@main/hooks/menu-hook'
import { useMainDefaultIpc } from './services/ipc-main'
import { createTray } from './services/tray-manager'
import InitWindow from './services/window-manager'
import { getWhatsAppChannelManager } from './channels/whatsapp/manager'
import { getTelegramChannelManager } from './channels/telegram/manager'
import { getDiscordChannelManager } from './channels/discord/manager'
import { getWeChatChannelManager } from './channels/wechat/manager'
import { getSlackChannelManager } from './channels/slack/manager'
import { getSchedulerManager } from './services/scheduler-manager'
import { registerMainProcessSupportHandlers } from './services/support-event-store'
import { refreshAuthAndEntitlement } from './services/entitlement-session'
import { loadStoredAccount } from './services/google-account-oauth'
import { getLspManager, initBundledLspBin } from './agent/lsp'
import { createLogger } from './logger'
import { prewarmMcpRuntimeEnvironment } from './services/mcp-runtime-check'
// Side-effect: register plan-mode todo foreach strategy (asar-safe; no dynamic import).
import './agent/steps/foreach-item/strategies/planned-todo-strategy'

const log = createLogger('app')

let lifecycleHooksRegistered = false

function registerLifecycleHooks(): void {
  if (lifecycleHooksRegistered) return
  lifecycleHooksRegistered = true

  app.on('before-quit', () => {
    Object.assign(app, { isQuiting: true })
    try {
      getLspManager().closeAll()
    } catch (err) {
      log.warn('LSP cleanup on quit failed', { err })
    }
  })

  app.on('browser-window-created', () => {
    log.info('Browser window created')
  })
}

/** Heavy main-process startup — mirrors the original index.ts sequence. */
export async function startMainApp(options: {
  splashWindow?: BrowserWindow
} = {}): Promise<void> {
  // bootstrap.js and main-app.js are separate bundles — each must initialize paths.
  initStaticPaths()
  registerLifecycleHooks()
  log.info('Main app module loaded; initializing desktop services')

  seedBundledDefaultRulesIfMissing(getTeralexiRulesDir())
  if (!isPackagedApp()) {
    clearSkillModuleCache()
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

  if (process.platform === 'darwin' && app.dock) {
    const icon = loadDockIcon()
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon)
    }
  }

  prewarmMcpRuntimeEnvironment()
  log.info('MCP runtime PATH prewarm requested')

  if (loadStoredAccount()) {
    try {
      await refreshAuthAndEntitlement('launch')
    } catch (err) {
      log.warn('Launch authorization refresh failed; signing out if session revoked', {
        err,
      })
    }
  }

  const initWindow = new InitWindow()
  if (options.splashWindow) {
    initWindow.adoptBootstrapSplash(options.splashWindow)
  }
  initWindow.initWindow()
  createTray(() => initWindow.mainWindow)
  log.info('Main window and tray initialized')

  void startToolSetCatalogLoad().catch((err) => {
    log.error('toolSet failed to load during startup; exiting', { err })
    dialog.showErrorBox(
      'Teralexi failed to start',
      'The tool catalog could not be loaded. The app will now close.',
    )
    app.exit(1)
  })

  if (isTeralexiTestMode()) {
    setSystemPropValue('settings.onboarding.completed', 'true')
    log.info('Test mode: seeded onboarding completion flag')
  }

  if (!isTeralexiTestMode()) {
    void getWhatsAppChannelManager().ensureStarted()
    void getTelegramChannelManager().ensureStarted()
    void getDiscordChannelManager().ensureStarted()
    void getWeChatChannelManager().ensureStarted()
    void getSlackChannelManager().ensureStarted()
    getSchedulerManager().ensureStarted()
    log.info('Background channel and scheduler services requested')
  } else {
    log.info('Test mode: skipped external channel and scheduler auto-start')
  }

  if (process.env.NODE_ENV === 'development') {
    const { VUEJS_DEVTOOLS } = require('electron-devtools-vendor')
    session.defaultSession.loadExtension(VUEJS_DEVTOOLS, {
      allowFileAccess: true,
    })
    log.info('Installed vue-devtools extension')
  }

  // Protocol OAuth callbacks are enabled from window-manager when the main
  // window is ready-to-show (renderer can receive GoogleAccountChanged).
}

export async function shutdownMainApp(): Promise<void> {
  try {
    getLspManager().closeAll()
  } catch {
    /* main-app may not have initialized LSP yet */
  }
}
