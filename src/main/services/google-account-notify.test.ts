import { beforeEach, describe, expect, it, vi } from 'vitest'

const { googleAccountChanged, getAllWindows, loadStoredAccount, googleAccountInfoForUi } =
  vi.hoisted(() => ({
    googleAccountChanged: vi.fn(),
    getAllWindows: vi.fn(),
    loadStoredAccount: vi.fn(),
    googleAccountInfoForUi: vi.fn(),
  }))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows,
  },
}))

vi.mock('./web-content-send', () => ({
  webContentSend: {
    GoogleAccountChanged: googleAccountChanged,
  },
}))

vi.mock('./google-account-oauth', () => ({
  loadStoredAccount,
  googleAccountInfoForUi,
}))

import {
  notifyGoogleAccountChanged,
  syncStoredGoogleAccountToRenderers,
} from './google-account-notify'

describe('google-account-notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('broadcasts account changes to live renderer windows', () => {
    const webContents = { id: 1 }
    getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents },
      { isDestroyed: () => true, webContents: { id: 2 } },
    ])

    const account = {
      email: 'user@example.com',
      name: 'User',
      picture: 'https://example.com/avatar.png',
    }
    notifyGoogleAccountChanged(account)

    expect(googleAccountChanged).toHaveBeenCalledTimes(1)
    expect(googleAccountChanged).toHaveBeenCalledWith(webContents, { account })
  })

  it('broadcasts sign-out with null account', () => {
    const webContents = { id: 1 }
    getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents }])

    notifyGoogleAccountChanged(null)

    expect(googleAccountChanged).toHaveBeenCalledWith(webContents, {
      account: null,
    })
  })

  it('syncs persisted account to renderers', () => {
    const webContents = { id: 1 }
    getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents }])
    loadStoredAccount.mockReturnValue({
      userInfo: {
        email: 'stored@example.com',
        name: 'Stored User',
        picture: '',
        sub: 'sub-1',
      },
      tokens: {} as never,
    })
    googleAccountInfoForUi.mockReturnValue({
      email: 'stored@example.com',
      name: 'Stored User',
      picture: '',
    })

    syncStoredGoogleAccountToRenderers()

    expect(googleAccountInfoForUi).toHaveBeenCalled()
    expect(googleAccountChanged).toHaveBeenCalledWith(webContents, {
      account: {
        email: 'stored@example.com',
        name: 'Stored User',
        picture: '',
      },
    })
  })

  it('syncs null when no account is stored', () => {
    const webContents = { id: 1 }
    getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents }])
    loadStoredAccount.mockReturnValue(null)

    syncStoredGoogleAccountToRenderers()

    expect(googleAccountChanged).toHaveBeenCalledWith(webContents, {
      account: null,
    })
    expect(googleAccountInfoForUi).not.toHaveBeenCalled()
  })
})
