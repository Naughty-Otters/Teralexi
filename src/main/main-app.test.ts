import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  initStaticPaths,
  seedBundledDefaultRulesIfMissing,
  clearSkillModuleCache,
  startToolSetCatalogLoad,
  disableF12,
  renderProcessGone,
  defaultIpc,
  createMenu,
  initBundledLspBin,
  prewarmMcpRuntimeEnvironment,
  registerMainProcessSupportHandlers,
  createTray,
  initWindowInstance,
  isTeralexiTestMode,
  isPackagedApp,
  setSystemPropValue,
  channelManagers,
  schedulerEnsureStarted,
  closeAllLsp,
  loadDockIcon,
  dockSetIcon,
  loadStoredAccount,
  refreshAuthAndEntitlement,
  startEntitlementPolling,
  showErrorBox,
  loadExtension,
} = vi.hoisted(() => ({
  initStaticPaths: vi.fn(),
  seedBundledDefaultRulesIfMissing: vi.fn(),
  clearSkillModuleCache: vi.fn(),
  startToolSetCatalogLoad: vi.fn(async () => undefined),
  disableF12: vi.fn(),
  renderProcessGone: vi.fn(),
  defaultIpc: vi.fn(),
  createMenu: vi.fn(),
  initBundledLspBin: vi.fn(() => '/tmp/lsp-bin'),
  prewarmMcpRuntimeEnvironment: vi.fn(),
  registerMainProcessSupportHandlers: vi.fn(),
  createTray: vi.fn(),
  initWindowInstance: {
    adoptBootstrapSplash: vi.fn(),
    initWindow: vi.fn(),
    mainWindow: { id: 'main' },
  },
  isTeralexiTestMode: vi.fn(() => false),
  isPackagedApp: vi.fn(() => false),
  setSystemPropValue: vi.fn(),
  channelManagers: {
    whatsapp: { ensureStarted: vi.fn(async () => undefined) },
    telegram: { ensureStarted: vi.fn(async () => undefined) },
    discord: { ensureStarted: vi.fn(async () => undefined) },
    wechat: { ensureStarted: vi.fn(async () => undefined) },
    slack: { ensureStarted: vi.fn(async () => undefined) },
  },
  schedulerEnsureStarted: vi.fn(),
  closeAllLsp: vi.fn(),
  loadDockIcon: vi.fn(() => ({ isEmpty: () => false })),
  dockSetIcon: vi.fn(),
  loadStoredAccount: vi.fn(() => null),
  refreshAuthAndEntitlement: vi.fn(async () => null),
  startEntitlementPolling: vi.fn(),
  showErrorBox: vi.fn(),
  loadExtension: vi.fn(async () => undefined),
}))

vi.mock('./config/static-path', () => ({
  initStaticPaths,
}))

vi.mock('./config/app-paths', () => ({
  resolveAppRoot: () => '/app',
  isPackagedApp,
}))

vi.mock('@config/teralexi-home', () => ({
  getTeralexiRulesDir: () => '/rules',
}))

vi.mock('@config/test-mode', () => ({
  isTeralexiTestMode,
}))

vi.mock('@config/system-prop', () => ({
  setSystemPropValue,
}))

vi.mock('./config/bundled-default-rules', () => ({
  seedBundledDefaultRulesIfMissing,
}))

vi.mock('@main/skills/skill-module-loader', () => ({
  clearSkillModuleCache,
  startToolSetCatalogLoad,
}))

vi.mock('./hooks/disable-button-hook', () => ({
  useDisableButton: () => ({ disableF12 }),
}))

vi.mock('@main/hooks/exception-hook', () => ({
  useProcessException: () => ({ renderProcessGone }),
}))

vi.mock('@main/hooks/menu-hook', () => ({
  useMenu: () => ({ createMenu }),
}))

vi.mock('./services/ipc-main', () => ({
  useMainDefaultIpc: () => ({ defaultIpc }),
}))

vi.mock('./services/support-event-store', () => ({
  registerMainProcessSupportHandlers,
}))

vi.mock('./agent/lsp', () => ({
  getLspManager: () => ({ closeAll: closeAllLsp }),
  initBundledLspBin,
}))

vi.mock('./config/app-icons', () => ({
  loadDockIcon,
}))

vi.mock('./services/mcp-runtime-check', () => ({
  prewarmMcpRuntimeEnvironment,
}))

vi.mock('./services/window-manager', () => ({
  default: vi.fn(function InitWindowMock() {
    return initWindowInstance
  }),
}))

vi.mock('./services/tray-manager', () => ({
  createTray,
}))

vi.mock('./channels/whatsapp/manager', () => ({
  getWhatsAppChannelManager: () => channelManagers.whatsapp,
}))
vi.mock('./channels/telegram/manager', () => ({
  getTelegramChannelManager: () => channelManagers.telegram,
}))
vi.mock('./channels/discord/manager', () => ({
  getDiscordChannelManager: () => channelManagers.discord,
}))
vi.mock('./channels/wechat/manager', () => ({
  getWeChatChannelManager: () => channelManagers.wechat,
}))
vi.mock('./channels/slack/manager', () => ({
  getSlackChannelManager: () => channelManagers.slack,
}))
vi.mock('./services/scheduler-manager', () => ({
  getSchedulerManager: () => ({ ensureStarted: schedulerEnsureStarted }),
}))

vi.mock('./services/google-account-oauth', () => ({
  loadStoredAccount,
}))

vi.mock('./services/entitlement-session', () => ({
  refreshAuthAndEntitlement,
  startEntitlementPolling,
}))

vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  traceFunction:
    (_log: unknown, _name: string, fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('./agent/steps/foreach-item/strategies/planned-todo-strategy', () => ({
  createPlannedTodoStrategy: vi.fn(),
}))

const appListeners = new Map<string, (...args: unknown[]) => void>()

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/app'),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      appListeners.set(event, cb)
    }),
    exit: vi.fn(),
    dock: { setIcon: dockSetIcon },
  },
  session: {
    defaultSession: {
      loadExtension,
    },
  },
  dialog: {
    showErrorBox,
  },
}))

import { app } from 'electron'
import { shutdownMainApp, startMainApp } from './main-app'

describe('startMainApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appListeners.clear()
    isTeralexiTestMode.mockReturnValue(false)
    isPackagedApp.mockReturnValue(false)
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    delete process.env.NODE_ENV
  })

  it('initializes desktop services and main window', async () => {
    const splashWindow = { id: 'splash' }
    await startMainApp({ splashWindow: splashWindow as never })

    expect(initStaticPaths).toHaveBeenCalled()
    expect(seedBundledDefaultRulesIfMissing).toHaveBeenCalledWith('/rules')
    expect(clearSkillModuleCache).toHaveBeenCalled()
    expect(registerMainProcessSupportHandlers).toHaveBeenCalled()
    expect(disableF12).toHaveBeenCalled()
    expect(defaultIpc).toHaveBeenCalled()
    expect(createMenu).toHaveBeenCalled()
    expect(initBundledLspBin).toHaveBeenCalled()
    expect(prewarmMcpRuntimeEnvironment).toHaveBeenCalled()
    expect(initWindowInstance.adoptBootstrapSplash).toHaveBeenCalledWith(
      splashWindow,
    )
    expect(initWindowInstance.initWindow).toHaveBeenCalled()
    expect(createTray).toHaveBeenCalledWith(expect.any(Function))
    const trayWindowProvider = createTray.mock.calls[0]?.[0] as (() => unknown) | undefined
    expect(trayWindowProvider?.()).toEqual(initWindowInstance.mainWindow)
    expect(startToolSetCatalogLoad).toHaveBeenCalled()
    expect(app.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
    appListeners.get('before-quit')?.()
    appListeners.get('browser-window-created')?.()
    expect(closeAllLsp).toHaveBeenCalled()
  })

  it('does not start channels or scheduler at launch outside test mode', async () => {
    await startMainApp()

    expect(channelManagers.whatsapp.ensureStarted).not.toHaveBeenCalled()
    expect(channelManagers.telegram.ensureStarted).not.toHaveBeenCalled()
    expect(channelManagers.discord.ensureStarted).not.toHaveBeenCalled()
    expect(channelManagers.wechat.ensureStarted).not.toHaveBeenCalled()
    expect(channelManagers.slack.ensureStarted).not.toHaveBeenCalled()
    expect(schedulerEnsureStarted).not.toHaveBeenCalled()
    expect(setSystemPropValue).not.toHaveBeenCalled()
  })

  it('skips external services and seeds onboarding in test mode', async () => {
    isTeralexiTestMode.mockReturnValue(true)

    await startMainApp()

    expect(setSystemPropValue).toHaveBeenCalledWith(
      'settings.onboarding.completed',
      'true',
    )
    expect(channelManagers.whatsapp.ensureStarted).not.toHaveBeenCalled()
    expect(schedulerEnsureStarted).not.toHaveBeenCalled()
  })

  it('skips skill module cache clear when packaged', async () => {
    isPackagedApp.mockReturnValue(true)

    await startMainApp()

    expect(clearSkillModuleCache).not.toHaveBeenCalled()
  })

  it('refreshes stored account on launch', async () => {
    loadStoredAccount.mockReturnValue({ email: 'user@example.com' })

    await startMainApp()

    expect(startEntitlementPolling).toHaveBeenCalled()
    expect(refreshAuthAndEntitlement).toHaveBeenCalledWith('launch')
  })

  it('continues startup when launch auth refresh fails', async () => {
    loadStoredAccount.mockReturnValue({ email: 'user@example.com' })
    refreshAuthAndEntitlement.mockRejectedValueOnce(new Error('revoked'))

    await startMainApp()

    expect(initWindowInstance.initWindow).toHaveBeenCalled()
  })

  it('exits when tool catalog load fails', async () => {
    startToolSetCatalogLoad.mockRejectedValueOnce(new Error('catalog missing'))

    await startMainApp()
    await Promise.resolve()

    expect(showErrorBox).toHaveBeenCalled()
    expect(app.exit).toHaveBeenCalledWith(1)
  })

  it('loads vue devtools in development', async () => {
    process.env.NODE_ENV = 'development'

    await startMainApp()

    expect(loadExtension).toHaveBeenCalled()
  })

  it('skips dock icon when empty on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    loadDockIcon.mockReturnValueOnce({ isEmpty: () => true })

    await startMainApp()

    expect(dockSetIcon).not.toHaveBeenCalled()
  })

  it('continues when bundled LSP init fails', async () => {
    initBundledLspBin.mockImplementationOnce(() => {
      throw new Error('missing lsp')
    })

    await startMainApp()

    expect(initWindowInstance.initWindow).toHaveBeenCalled()
  })
})

describe('shutdownMainApp', () => {
  it('closes all LSP clients', async () => {
    await shutdownMainApp()
    expect(closeAllLsp).toHaveBeenCalled()
  })

  it('ignores LSP cleanup errors', async () => {
    closeAllLsp.mockImplementationOnce(() => {
      throw new Error('not initialized')
    })

    await expect(shutdownMainApp()).resolves.toBeUndefined()
  })
})
