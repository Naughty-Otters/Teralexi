import { describe, expect, it, vi } from 'vitest'

const whenReady = vi.fn(() => ({
  then: (fn: () => void) => {
    fn()
    return Promise.resolve()
  },
}))

vi.mock('electron', () => ({
  app: {
    whenReady,
    setName: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
    on: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    dock: { setIcon: vi.fn() },
    removeAsDefaultProtocolClient: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    isPackaged: false,
    getAppPath: vi.fn(() => '/app'),
  },
  session: { defaultSession: { loadExtension: vi.fn() } },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      resize: vi.fn(function resize() {
        return { isEmpty: () => false }
      }),
    })),
  },
}))

vi.mock('@config/openfde-home', () => ({
  initializeopenfdeHome: vi.fn(),
  getopenfdeRulesDir: vi.fn(() => '/mock/.openfde/rules'),
}))

vi.mock('./config/bundled-default-rules', () => ({
  seedBundledDefaultRulesIfMissing: vi.fn(),
}))

vi.mock('@main/services/client-identity', () => ({
  ensureClientId: vi.fn(),
}))

vi.mock('@main/skills/skill-module-loader', () => ({
  clearSkillModuleCache: vi.fn(),
  loadToolSetTools: vi.fn(async () => []),
}))

vi.mock('./services/window-manager', () => ({
  default: class MockInitWindow {
    mainWindow = {}
    initWindow = vi.fn()
  },
}))

vi.mock('./hooks/disable-button-hook', () => ({
  useDisableButton: () => ({ disableF12: vi.fn() }),
}))

vi.mock('./hooks/exception-hook', () => ({
  useProcessException: () => ({ renderProcessGone: vi.fn() }),
}))

vi.mock('./hooks/menu-hook', () => ({
  useMenu: () => ({ createMenu: vi.fn() }),
}))

vi.mock('./services/ipc-main', () => ({
  useMainDefaultIpc: () => ({ defaultIpc: vi.fn() }),
}))

vi.mock('./services/tray-manager', () => ({
  createTray: vi.fn(),
}))

vi.mock('./config/static-path', () => ({
  getIconPath: vi.fn(() => '/icon.icns'),
  initStaticPaths: vi.fn(),
  getWinURL: vi.fn(() => 'http://localhost'),
  getLoadingURL: vi.fn(() => 'http://localhost/loader'),
  getPreloadFile: vi.fn((name: string) => `/app/${name}.js`),
}))

vi.mock('./channels/whatsapp/manager', () => ({
  getWhatsAppChannelManager: () => ({ ensureStarted: vi.fn() }),
}))

vi.mock('./channels/telegram/manager', () => ({
  getTelegramChannelManager: () => ({ ensureStarted: vi.fn() }),
}))

vi.mock('./channels/discord/manager', () => ({
  getDiscordChannelManager: () => ({ ensureStarted: vi.fn() }),
}))

vi.mock('./channels/wechat/manager', () => ({
  getWeChatChannelManager: () => ({ ensureStarted: vi.fn() }),
}))

vi.mock('./channels/slack/manager', () => ({
  getSlackChannelManager: () => ({ ensureStarted: vi.fn() }),
}))

vi.mock('./services/scheduler-manager', () => ({
  getSchedulerManager: () => ({ ensureStarted: vi.fn() }),
}))

vi.mock('./services/openfde-protocol-handler', () => ({
  registerOpenFdeProtocolClient: vi.fn(),
  registerOpenFdeProtocolHandlers: vi.fn(),
  requestOpenFdeSingleInstanceLock: vi.fn(() => true),
  setOpenFdeProtocolHandlerReady: vi.fn(),
}))

describe('main index', () => {
  it('bootstraps app on ready without throwing', async () => {
    vi.stubGlobal('process', {
      ...process,
      defaultApp: false,
      argv: ['electron'],
      env: { ...process.env, NODE_ENV: 'test' },
      platform: process.platform,
      on: vi.fn(),
    })
    await import('./index')
    expect(whenReady).toHaveBeenCalled()
  })
})
