import { afterEach, describe, expect, it, vi } from 'vitest'

const { getTeralexiServerAccessToken } = vi.hoisted(() => ({
  getTeralexiServerAccessToken: vi.fn(),
}))

vi.mock('./teralexi-server-auth', () => ({
  getPersistedServerAccessTokenForSessionCheck: vi.fn(),
  getTeralexiServerAccessToken,
}))

import { checkTeralexiServerSession } from './entitlement-client'

describe('checkTeralexiServerSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns ok when /auth/me succeeds after resolving access token', async () => {
    getTeralexiServerAccessToken.mockResolvedValue('server-jwt')
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
    expect(getTeralexiServerAccessToken).toHaveBeenCalledWith('http://localhost:8000')
  })

  it('returns rejected when /auth/me returns 401', async () => {
    getTeralexiServerAccessToken.mockResolvedValue('server-jwt')
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
      reason: 'rejected',
      message: 'Unauthorized',
      status: 401,
    })
  })

  it('returns no-token when access token cannot be resolved', async () => {
    getTeralexiServerAccessToken.mockResolvedValue(null)

    await expect(checkTeralexiServerSession('http://localhost:8000')).resolves.toEqual({
      ok: false,
      reason: 'no-token',
      message: 'Teralexi server session is not available',
    })
  })

  it('treats access-token resolution errors as transient', async () => {
    getTeralexiServerAccessToken.mockRejectedValue(new Error('network down'))

    await expect(checkTeralexiServerSession('http://localhost:8000')).resolves.toEqual({
      ok: null,
      transientError: expect.any(Error),
    })
  })
})
