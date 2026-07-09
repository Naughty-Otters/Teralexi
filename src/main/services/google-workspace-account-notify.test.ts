import { beforeEach, describe, expect, it, vi } from 'vitest'

const { googleWorkspaceAccountChanged, getAllWindows } = vi.hoisted(() => ({
  googleWorkspaceAccountChanged: vi.fn(),
  getAllWindows: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows,
  },
}))

vi.mock('./web-content-send', () => ({
  webContentSend: {
    GoogleWorkspaceAccountChanged: googleWorkspaceAccountChanged,
  },
}))

import { notifyGoogleWorkspaceAccountChanged } from './google-workspace-account-notify'

describe('google-workspace-account-notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('broadcasts workspace account changes to live renderer windows', () => {
    const webContents = { id: 1 }
    getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents },
      { isDestroyed: () => true, webContents: { id: 2 } },
    ])

    const account = {
      email: 'workspace@example.com',
      name: 'Workspace User',
      picture: 'https://example.com/avatar.png',
      workspaceAccess: true,
    }
    notifyGoogleWorkspaceAccountChanged(account)

    expect(googleWorkspaceAccountChanged).toHaveBeenCalledTimes(1)
    expect(googleWorkspaceAccountChanged).toHaveBeenCalledWith(webContents, {
      account,
    })
  })

  it('broadcasts sign-out with null account', () => {
    const webContents = { id: 1 }
    getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents }])

    notifyGoogleWorkspaceAccountChanged(null)

    expect(googleWorkspaceAccountChanged).toHaveBeenCalledWith(webContents, {
      account: null,
    })
  })
})
