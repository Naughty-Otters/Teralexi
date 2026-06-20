import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/app'), getVersion: vi.fn(() => '1.0.0') },
  dialog: {},
  BrowserWindow: vi.fn(),
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    setFeedURL: vi.fn(),
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
  },
}))

vi.mock('../config/static-path', () => ({
  getPreloadFile: vi.fn(),
  winURL: 'http://localhost',
}))

vi.mock('./check-update', () => ({
  getAppUpdateManager: vi.fn(() => ({
    checkUpdate: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  })),
}))

vi.mock('./download-file', () => ({
  default: class MockDownload {},
}))

vi.mock('@config/system-prop', () => ({
  ensureSystemPropFile: vi.fn(),
  getSystemPropValue: vi.fn((key: string, def?: string) =>
    key === 'app.dev.port' ? '9080' : (def ?? ''),
  ),
  getSystemPropValues: vi.fn(() => ({})),
  isValidSystemPropKey: vi.fn((key: string) => key.includes('.')),
  setSystemPropValue: vi.fn(),
}))

vi.mock('../skills/skills', () => ({
  getSkillsDir: vi.fn(() => '/skills'),
  loadSkills: vi.fn(async () => []),
  loadSkillActions: vi.fn(async () => []),
  loadToolSetTools: vi.fn(async () => []),
  skillToAgent: vi.fn(),
}))

vi.mock('./conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    listConversations: vi.fn(() => []),
  })),
}))

vi.mock('./google-oauth', () => ({
  startGoogleSignIn: vi.fn(),
  loadStoredAccount: vi.fn(),
  clearStoredAccount: vi.fn(),
}))

vi.mock('./github-oauth', () => ({
  startGitHubSignIn: vi.fn(),
  loadStoredAccount: vi.fn(),
  clearStoredAccount: vi.fn(),
}))

vi.mock('./mcp-server-manager', () => ({
  getMcpServerManager: vi.fn(() => ({})),
}))

vi.mock('@main/channels/whatsapp/manager', () => ({
  getWhatsAppChannelManager: vi.fn(() => ({})),
}))

vi.mock('./scheduler-manager', () => ({
  getSchedulerManager: vi.fn(() => ({ ensureStarted: vi.fn() })),
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: vi.fn(() => ({ register: vi.fn(), get: vi.fn() })),
}))

vi.mock('@main/engine', () => ({
  runAgentForConversation: vi.fn(),
  stopAgentForConversation: vi.fn(),
}))

vi.mock('./sandbox-output-view', () => ({
  syncSandboxOutputView: vi.fn(),
}))

vi.mock('./remove-sandbox-directories', () => ({
  removeSandboxDirectories: vi.fn(),
}))

import { IpcMainHandleClass } from './ipc-main-handle'

describe('IpcMainHandleClass', () => {
  it('GetSystemConfig returns value for valid key', async () => {
    const ipc = new IpcMainHandleClass()
    const value = await ipc.GetSystemConfig({} as never, {
      key: 'app.dev.port',
      defaultValue: '1',
    })
    expect(value).toBe('9080')
  })

  it('GetSystemConfig rejects invalid keys', async () => {
    const ipc = new IpcMainHandleClass()
    const value = await ipc.GetSystemConfig({} as never, {
      key: 'bad',
      defaultValue: 'fallback',
    })
    expect(value).toBe('fallback')
  })
})
