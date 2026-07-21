import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTeralexiProtocolBridge } from './teralexi-protocol-bridge'

const mockHandleDeepLink = vi.fn(async () => ({
  userInfo: { email: 'a@b.com', name: 'A', picture: '' },
  tokens: {},
}))
const mockSyncStored = vi.fn()
const mockRevokeLocal = vi.fn()

vi.mock('@main/services/local-auth-session', () => ({
  revokeLocalTeralexiAuthSession: (...args: unknown[]) => mockRevokeLocal(...args),
}))

vi.mock('@main/services/google-account-oauth', () => ({
  handleGoogleAccountOAuthDeepLink: (...args: unknown[]) =>
    mockHandleDeepLink(...args),
}))

vi.mock('@main/services/google-account-notify', () => ({
  syncStoredGoogleAccountToRenderers: () => mockSyncStored(),
}))

vi.mock('@main/services/teralexi-server-auth', () => ({
  acceptPresentedServerAccessToken: vi.fn(),
  isLikelyPresentedServerAccessToken: () => false,
}))

vi.mock('@main/services/teralexi-platform-config', () => ({
  getTeralexiBaseApiUrl: () => 'http://localhost:8000',
}))

const { mockWindows, BrowserWindow } = vi.hoisted(() => {
  const mockWindows: Array<{
    isDestroyed: () => boolean
    isMinimized: () => boolean
    isAlwaysOnTop: () => boolean
    getTitle: () => string
    restore: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }> = []
  return {
    mockWindows,
    BrowserWindow: {
      getAllWindows: () => mockWindows,
    },
  }
})

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(),
    removeAsDefaultProtocolClient: vi.fn(() => true),
    requestSingleInstanceLock: vi.fn(() => true),
    isPackaged: false,
  },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
  },
  BrowserWindow,
}))

describe('teralexi-protocol-handler', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as Record<string, unknown>).__teralexiProtocolBridge
    mockWindows.length = 0
    mockHandleDeepLink.mockClear()
    mockSyncStored.mockClear()
    mockRevokeLocal.mockClear()
  })

  it('queues OAuth URLs until main-app registers dispatch', async () => {
    const mod = await import('./teralexi-protocol-handler')
    mod.handleTeralexiProtocolUrl('teralexi://open?token=queued')
    expect(mockHandleDeepLink).not.toHaveBeenCalled()
    expect(getTeralexiProtocolBridge().pendingUrls).toEqual([
      'teralexi://open?token=queued',
    ])

    mod.setTeralexiProtocolHandlerReady(mod.dispatchTeralexiUrl)
    await Promise.resolve()
    await Promise.resolve()
    expect(mockHandleDeepLink).toHaveBeenCalledWith({
      accessToken: 'queued',
      refreshToken: undefined,
      expiresIn: undefined,
      scope: undefined,
    })
    expect(mockSyncStored).toHaveBeenCalled()
  })

  it('clears OS protocol binding for unpackaged apps instead of registering Electron', async () => {
    const { app } = await import('electron')
    vi.mocked(app.removeAsDefaultProtocolClient).mockClear()
    vi.mocked(app.setAsDefaultProtocolClient).mockClear()
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })

    const mod = await import('./teralexi-protocol-handler')
    mod.registerTeralexiProtocolClient()

    expect(app.removeAsDefaultProtocolClient).toHaveBeenCalledWith('teralexi')
    expect(app.removeAsDefaultProtocolClient).toHaveBeenCalledWith(
      'teralexi',
      process.execPath,
    )
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled()
  })

  it('registers packaged protocol client for OS deep links', async () => {
    const { app } = await import('electron')
    vi.mocked(app.setAsDefaultProtocolClient).mockClear()
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })

    const mod = await import('./teralexi-protocol-handler')
    mod.registerTeralexiProtocolClient()

    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('teralexi')
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
  })

  it('registers privileged scheme and in-process handler when unpackaged', async () => {
    const { app, protocol } = await import('electron')
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    vi.mocked(protocol.registerSchemesAsPrivileged).mockClear()
    vi.mocked(protocol.handle).mockClear()

    const mod = await import('./teralexi-protocol-handler')
    mod.registerTeralexiProtocolScheme()
    mod.registerInternalTeralexiProtocolHandler()

    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      expect.objectContaining({ scheme: 'teralexi' }),
    ])
    expect(protocol.handle).toHaveBeenCalledWith('teralexi', expect.any(Function))
  })
  it('uses the dispatch function registered by main-app bundle', async () => {
    const mod = await import('./teralexi-protocol-handler')
    const customDispatch = vi.fn(async () => {})
    mod.setTeralexiProtocolHandlerReady(customDispatch)
    mod.handleTeralexiProtocolUrl('teralexi://open?token=live')
    await Promise.resolve()
    expect(customDispatch).toHaveBeenCalledWith('teralexi://open?token=live')
    expect(mockHandleDeepLink).not.toHaveBeenCalled()
  })

  it('revokes local auth on teralexi://logout', async () => {
    const mod = await import('./teralexi-protocol-handler')
    mod.setTeralexiProtocolHandlerReady(mod.dispatchTeralexiUrl)
    mod.handleTeralexiProtocolUrl('teralexi://logout')
    await Promise.resolve()

    expect(mockRevokeLocal).toHaveBeenCalledWith(
      'Signed out from Teralexi web authentication',
      { cause: 'web-logout' },
    )
    expect(mockHandleDeepLink).not.toHaveBeenCalled()
    expect(mockSyncStored).toHaveBeenCalled()
  })

  it('focuses the non-always-on-top window', async () => {
    const splash = {
      isDestroyed: () => false,
      isMinimized: () => false,
      isAlwaysOnTop: () => true,
      getTitle: () => 'Splash',
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
    }
    const main = {
      isDestroyed: () => false,
      isMinimized: () => false,
      isAlwaysOnTop: () => false,
      getTitle: () => 'Teralexi',
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
    }
    mockWindows.push(splash, main)

    const mod = await import('./teralexi-protocol-handler')
    mod.setTeralexiProtocolHandlerReady(mod.dispatchTeralexiUrl)
    mod.handleTeralexiProtocolUrl('teralexi://open?token=live')
    await Promise.resolve()
    await Promise.resolve()

    expect(main.focus).toHaveBeenCalled()
    expect(splash.focus).not.toHaveBeenCalled()
  })

  it('syncs account to renderers when deep-link OAuth fails so UI is not left stale', async () => {
    mockHandleDeepLink.mockRejectedValueOnce(new Error('invalid token'))

    const mod = await import('./teralexi-protocol-handler')
    mod.setTeralexiProtocolHandlerReady(mod.dispatchTeralexiUrl)
    mod.handleTeralexiProtocolUrl('teralexi://open?token=bad')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockHandleDeepLink).toHaveBeenCalled()
    expect(mockSyncStored).toHaveBeenCalled()
  })
})
