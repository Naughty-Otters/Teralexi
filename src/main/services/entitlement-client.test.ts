import { afterEach, describe, expect, it, vi } from 'vitest'

const { getPersistedServerAccessTokenForSessionCheck } = vi.hoisted(() => ({
  getPersistedServerAccessTokenForSessionCheck: vi.fn(),
}))

vi.mock('./teralexi-server-auth', () => ({
  getPersistedServerAccessTokenForSessionCheck,
  getTeralexiServerAccessToken: vi.fn(),
}))

import { checkTeralexiServerSession } from './entitlement-client'

describe('checkTeralexiServerSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns ok when /auth/me succeeds with persisted token', async () => {
    getPersistedServerAccessTokenForSessionCheck.mockReturnValue('server-jwt')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 1, sub_id: 'g', email: 'a@b.c' }),
      })),
    )

    await expect(checkTeralexiServerSession('http://localhost:8000')).resolves.toEqual({
      ok: true,
    })
    expect(getPersistedServerAccessTokenForSessionCheck).toHaveBeenCalled()
  })

  it('returns revoked when /auth/me returns 401', async () => {
    getPersistedServerAccessTokenForSessionCheck.mockReturnValue('server-jwt')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Unauthorized' }),
      })),
    )

    await expect(checkTeralexiServerSession('http://localhost:8000')).resolves.toEqual({
      ok: false,
      message: 'Unauthorized',
      status: 401,
    })
  })

  it('returns unavailable when no persisted server token', async () => {
    getPersistedServerAccessTokenForSessionCheck.mockReturnValue(null)

    await expect(checkTeralexiServerSession('http://localhost:8000')).resolves.toEqual({
      ok: false,
      message: 'Teralexi server session is not available',
      status: 401,
    })
  })
})
