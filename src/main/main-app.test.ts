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
      loadExtension: vi.fn(async () => undefined),
    },
  },
  dialog: {
    showErrorBox: vi.fn(),
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
    expect(startToolSetCatalogLoad).toHaveBeenCalled()
    expect(app.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
    appListeners.get('before-quit')?.()
    expect(closeAllLsp).toHaveBeenCalled()
  })

  it('starts background channels outside test mode', async () => {
    await startMainApp()

    expect(channelManagers.whatsapp.ensureStarted).toHaveBeenCalled()
    expect(channelManagers.telegram.ensureStarted).toHaveBeenCalled()
    expect(channelManagers.discord.ensureStarted).toHaveBeenCalled()
    expect(channelManagers.wechat.ensureStarted).toHaveBeenCalled()
    expect(channelManagers.slack.ensureStarted).toHaveBeenCalled()
    expect(schedulerEnsureStarted).toHaveBeenCalled()
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
})

describe('shutdownMainApp', () => {
  it('closes all LSP clients', async () => {
    await shutdownMainApp()
    expect(closeAllLsp).toHaveBeenCalled()
  })
})
