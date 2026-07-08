import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTeralexiProtocolBridge } from './teralexi-protocol-bridge'

const mockHandleDeepLink = vi.fn(async () => ({
  userInfo: { email: 'a@b.com', name: 'A', picture: '' },
  tokens: {},
}))
const mockClearCache = vi.fn()
const mockSyncStored = vi.fn()

vi.mock('@main/services/google-account-oauth', () => ({
  handleGoogleAccountOAuthDeepLink: (...args: unknown[]) =>
    mockHandleDeepLink(...args),
}))

vi.mock('@main/services/google-account-notify', () => ({
  syncStoredGoogleAccountToRenderers: () => mockSyncStored(),
}))

vi.mock('@main/services/teralexi-server-auth', () => ({
  clearTeralexiServerAuthCache: () => mockClearCache(),
}))

const { mockWindows, BrowserWindow } = vi.hoisted(() => {
  const mockWindows: Array<{
    isDestroyed: () => boolean
    isMinimized: () => boolean
    isAlwaysOnTop: () => boolean
    restore: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
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
    requestSingleInstanceLock: vi.fn(() => true),
  },
  BrowserWindow,
}))

describe('teralexi-protocol-handler', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as Record<string, unknown>).__teralexiProtocolBridge
    mockWindows.length = 0
    mockHandleDeepLink.mockClear()
    mockClearCache.mockClear()
    mockSyncStored.mockClear()
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
    expect(mockClearCache).toHaveBeenCalled()
    expect(mockSyncStored).toHaveBeenCalled()
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

  it('focuses the non-always-on-top window', async () => {
    const splash = {
      isDestroyed: () => false,
      isMinimized: () => false,
      isAlwaysOnTop: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    const main = {
      isDestroyed: () => false,
      isMinimized: () => false,
      isAlwaysOnTop: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
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
})
