import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getOpenFdeAccountGoogleIdToken } = vi.hoisted(() => ({
  getOpenFdeAccountGoogleIdToken: vi.fn(),
}))

vi.mock('@main/services/google-account-oauth', () => ({
  getOpenFdeAccountGoogleIdToken,
}))

import {
  clearOpenFdeServerAuthCache,
  exchangeGoogleIdTokenForServerAccessToken,
  getOpenFdeServerAccessToken,
  refreshServerAccessToken,
  resolveMetricsApiBaseUrl,
} from './openfde-server-auth'

function makeTestJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url')
  const body = Buffer.from(JSON.stringify({ exp: expSeconds }))
    .toString('base64url')
  return `${header}.${body}.signature`
}

describe('openfde-server-auth', () => {
  beforeEach(() => {
    clearOpenFdeServerAuthCache()
    getOpenFdeAccountGoogleIdToken.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('resolveMetricsApiBaseUrl derives origin from GraphQL URL', () => {
    expect(resolveMetricsApiBaseUrl('http://127.0.0.1:8000/graphql')).toBe(
      'http://127.0.0.1:8000',
    )
  })

  it('exchanges Google id_token for server access_token', async () => {
    const serverJwt = makeTestJwt(Math.floor(Date.now() / 1000) + 3600)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: serverJwt, expires_in: 3600 }),
    } as Response)

    const token = await exchangeGoogleIdTokenForServerAccessToken({
      apiBaseUrl: 'http://127.0.0.1:8000',
      idToken: 'google-id-token',
    })

    expect(token).toBe(serverJwt)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id_token: 'google-id-token' }),
      }),
    )
  })

  it('refreshes server access_token', async () => {
    const refreshedJwt = makeTestJwt(Math.floor(Date.now() / 1000) + 7200)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: refreshedJwt }),
    } as Response)

    const token = await refreshServerAccessToken({
      apiBaseUrl: 'http://127.0.0.1:8000',
      accessToken: 'old-server-jwt',
    })

    expect(token).toBe(refreshedJwt)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/auth/token',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer old-server-jwt',
        }),
      }),
    )
  })

  it('getOpenFdeServerAccessToken caches exchange result', async () => {
    const serverJwt = makeTestJwt(Math.floor(Date.now() / 1000) + 3600)
    getOpenFdeAccountGoogleIdToken.mockReturnValue('google-id-token')
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: serverJwt }),
    } as Response)

    await expect(
      getOpenFdeServerAccessToken('http://127.0.0.1:8000'),
    ).resolves.toBe(serverJwt)
    await expect(
      getOpenFdeServerAccessToken('http://127.0.0.1:8000'),
    ).resolves.toBe(serverJwt)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
