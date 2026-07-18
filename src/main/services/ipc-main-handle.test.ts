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
  getWinURL: vi.fn(() => 'http://localhost'),
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

vi.mock('./google-account-oauth', () => ({
  startGoogleAccountSignIn: vi.fn(),
  loadStoredAccount: vi.fn(),
  clearStoredAccount: vi.fn(),
  googleAccountInfoForUi: vi.fn(),
}))

vi.mock('./google-workspace-oauth', () => ({
  startGoogleWorkspaceSignIn: vi.fn(),
  loadStoredAccount: vi.fn(),
  clearStoredAccount: vi.fn(),
  googleWorkspaceAccountInfoForUi: vi.fn(),
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
  navigateSandboxOutputView: vi.fn(),
}))

vi.mock('./remove-sandbox-directories', () => ({
  removeSandboxDirectories: vi.fn(),
}))

vi.mock('./teralexi-server-auth', () => ({
  clearTeralexiServerAuthCache: vi.fn(),
}))

vi.mock('./local-auth-session', () => ({
  revokeLocalTeralexiAuthSession: vi.fn(),
}))

vi.mock('./entitlement-session', () => ({
  clearEntitlementSession: vi.fn(),
  getEntitlementUiSnapshot: vi.fn(),
  onConversationStarted: vi.fn(),
  refreshAuthAndEntitlement: vi.fn(async () => null),
}))

import { startGoogleAccountSignIn, googleAccountInfoForUi } from './google-account-oauth'
import { clearTeralexiServerAuthCache } from './teralexi-server-auth'
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

  it('GoogleSignIn does not clear server JWT before OAuth so failed re-login keeps session', async () => {
    vi.mocked(startGoogleAccountSignIn).mockRejectedValueOnce(
      new Error('user cancelled'),
    )

    const ipc = new IpcMainHandleClass()
    await expect(ipc.GoogleSignIn({} as never)).rejects.toThrow('user cancelled')
    expect(clearTeralexiServerAuthCache).not.toHaveBeenCalled()
  })

  it('GoogleSignIn returns UI account after successful OAuth without pre-clearing JWT', async () => {
    vi.mocked(startGoogleAccountSignIn).mockResolvedValueOnce({
      email: 'a@b.com',
      name: 'A',
      picture: '',
    } as never)
    vi.mocked(googleAccountInfoForUi).mockReturnValueOnce({
      email: 'a@b.com',
      name: 'A',
      picture: '',
    })

    const ipc = new IpcMainHandleClass()
    await expect(ipc.GoogleSignIn({} as never)).resolves.toEqual({
      email: 'a@b.com',
      name: 'A',
      picture: '',
    })
    expect(clearTeralexiServerAuthCache).not.toHaveBeenCalled()
  })
})
