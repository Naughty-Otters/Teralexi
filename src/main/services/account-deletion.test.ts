import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@main/services/teralexi-platform-config', () => ({
  getTeralexiBaseApiUrl: vi.fn(),
}))

vi.mock('@main/services/teralexi-server-auth', () => ({
  getTeralexiServerAccessToken: vi.fn(),
  forceRefreshTeralexiServerAccessToken: vi.fn(),
  deleteAccountServerSession: vi.fn(),
}))

vi.mock('@main/services/local-auth-session', () => ({
  revokeLocalTeralexiAuthSession: vi.fn(),
}))

vi.mock('@main/services/entitlement-session', () => ({
  clearEntitlementSession: vi.fn(),
}))

import { getTeralexiBaseApiUrl } from '@main/services/teralexi-platform-config'
import {
  deleteAccountServerSession,
  forceRefreshTeralexiServerAccessToken,
  getTeralexiServerAccessToken,
} from '@main/services/teralexi-server-auth'
import { revokeLocalTeralexiAuthSession } from '@main/services/local-auth-session'
import { clearEntitlementSession } from '@main/services/entitlement-session'
import { deleteTeralexiAccount } from './account-deletion'

describe('deleteTeralexiAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes with confirm:true then clears local identity', async () => {
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('https://api.example.com')
    vi.mocked(getTeralexiServerAccessToken).mockResolvedValue('access-token')
    vi.mocked(deleteAccountServerSession).mockResolvedValue({ ok: true })

    const result = await deleteTeralexiAccount()

    expect(result).toEqual({
      serverDeleted: true,
      localCleared: true,
      serverMessage: '',
    })
    expect(deleteAccountServerSession).toHaveBeenCalledWith({
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'access-token',
      confirm: true,
    })
    expect(revokeLocalTeralexiAuthSession).toHaveBeenCalledWith(
      'Account deleted from Teralexi',
      { cause: 'user-account-deletion', revokeRemote: false },
    )
    expect(clearEntitlementSession).toHaveBeenCalled()
  })

  it('keeps the session on 503 so the user can retry', async () => {
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('https://api.example.com')
    vi.mocked(getTeralexiServerAccessToken).mockResolvedValue('access-token')
    vi.mocked(deleteAccountServerSession).mockResolvedValue({
      ok: false,
      status: 503,
      message: 'storage failed',
    })

    const result = await deleteTeralexiAccount()

    expect(result).toMatchObject({
      serverDeleted: false,
      localCleared: false,
      errorCode: 'retryable',
    })
    expect(revokeLocalTeralexiAuthSession).not.toHaveBeenCalled()
  })

  it('refreshes once on 401 then retries delete', async () => {
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('https://api.example.com')
    vi.mocked(getTeralexiServerAccessToken).mockResolvedValue('stale-token')
    vi.mocked(deleteAccountServerSession)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        message: 'Unauthorized',
      })
      .mockResolvedValueOnce({ ok: true })
    vi.mocked(forceRefreshTeralexiServerAccessToken).mockResolvedValue(
      'fresh-token',
    )

    const result = await deleteTeralexiAccount()

    expect(result.serverDeleted).toBe(true)
    expect(forceRefreshTeralexiServerAccessToken).toHaveBeenCalledWith(
      'https://api.example.com',
    )
    expect(deleteAccountServerSession).toHaveBeenNthCalledWith(2, {
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'fresh-token',
      confirm: true,
    })
  })

  it('signs out when 401 refresh fails', async () => {
    vi.mocked(getTeralexiBaseApiUrl).mockReturnValue('https://api.example.com')
    vi.mocked(getTeralexiServerAccessToken).mockResolvedValue('stale-token')
    vi.mocked(deleteAccountServerSession).mockResolvedValue({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    })
    vi.mocked(forceRefreshTeralexiServerAccessToken).mockResolvedValue(null)

    const result = await deleteTeralexiAccount()

    expect(result).toMatchObject({
      serverDeleted: false,
      localCleared: true,
      errorCode: 'auth_required',
    })
    expect(revokeLocalTeralexiAuthSession).toHaveBeenCalled()
  })
})
