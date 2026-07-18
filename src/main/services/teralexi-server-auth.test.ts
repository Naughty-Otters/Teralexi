import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getTeralexiAccountGoogleIdToken, getStoredPresentedServerAccessToken } =
  vi.hoisted(() => ({
    getTeralexiAccountGoogleIdToken: vi.fn(),
    getStoredPresentedServerAccessToken: vi.fn(() => null),
  }))

vi.mock('@main/services/google-account-oauth', () => ({
  getTeralexiAccountGoogleIdToken,
  getStoredPresentedServerAccessToken,
}))

vi.mock('./server-auth-store', () => ({
  clearPersistedServerAuth: vi.fn(),
  getPersistedServerAccessToken: vi.fn(() => null),
  loadPersistedServerAuth: vi.fn(() => null),
  savePersistedServerAuth: vi.fn(),
}))

import {
  clearTeralexiServerAuthCache,
  exchangeGoogleIdTokenForServerAccessToken,
  getTeralexiServerAccessToken,
  refreshServerAccessToken,
  resolveMetricsApiBaseUrl,
} from './teralexi-server-auth'
import { savePersistedServerAuth } from './server-auth-store'

function makeTestJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url')
  const body = Buffer.from(JSON.stringify({ exp: expSeconds }))
    .toString('base64url')
  return `${header}.${body}.signature`
}

describe('teralexi-server-auth', () => {
  beforeEach(() => {
    clearTeralexiServerAuthCache()
    getTeralexiAccountGoogleIdToken.mockReset()
    getStoredPresentedServerAccessToken.mockReset()
    getStoredPresentedServerAccessToken.mockReturnValue(null)
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
    expect(savePersistedServerAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: 'http://127.0.0.1:8000',
        accessToken: serverJwt,
      }),
    )
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

  it('getTeralexiServerAccessToken caches exchange result', async () => {
    const serverJwt = makeTestJwt(Math.floor(Date.now() / 1000) + 3600)
    getTeralexiAccountGoogleIdToken.mockReturnValue('google-id-token')
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: serverJwt }),
    } as Response)

    await expect(
      getTeralexiServerAccessToken('http://127.0.0.1:8000'),
    ).resolves.toBe(serverJwt)
    await expect(
      getTeralexiServerAccessToken('http://127.0.0.1:8000'),
    ).resolves.toBe(serverJwt)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes soft-expired cache instead of signing out', async () => {
    const soonExpiring = makeTestJwt(Math.floor(Date.now() / 1000) + 30)
    const renewed = makeTestJwt(Math.floor(Date.now() / 1000) + 7200)
    getTeralexiAccountGoogleIdToken.mockReturnValue(null)

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: soonExpiring, expires_in: 30 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: renewed, expires_in: 7200 }),
      } as Response)

    // Seed cache via exchange.
    getTeralexiAccountGoogleIdToken.mockReturnValueOnce('google-id-token')
    await exchangeGoogleIdTokenForServerAccessToken({
      apiBaseUrl: 'http://127.0.0.1:8000',
      idToken: 'google-id-token',
    })
    getTeralexiAccountGoogleIdToken.mockReturnValue(null)

    await expect(
      getTeralexiServerAccessToken('http://127.0.0.1:8000'),
    ).resolves.toBe(renewed)

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8000/api/v1/auth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${soonExpiring}`,
        }),
      }),
    )
  })

  it('exchanges Google id_token remotely when local server JWT is missing', async () => {
    const serverJwt = makeTestJwt(Math.floor(Date.now() / 1000) + 3600)
    getTeralexiAccountGoogleIdToken.mockReturnValue('google-id-token')
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: serverJwt, expires_in: 3600 }),
    } as Response)

    await expect(
      getTeralexiServerAccessToken('http://127.0.0.1:8000'),
    ).resolves.toBe(serverJwt)

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id_token: 'google-id-token' }),
      }),
    )
  })

  it('uses presented platform JWT when Google id_token is unavailable', async () => {
    const platformJwt = makeTestJwt(Math.floor(Date.now() / 1000) + 3600)
    getTeralexiAccountGoogleIdToken.mockReturnValue(null)
    getStoredPresentedServerAccessToken.mockReturnValue(platformJwt)

    await expect(
      getTeralexiServerAccessToken('http://127.0.0.1:8000'),
    ).resolves.toBe(platformJwt)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('passes AbortSignal on auth exchange and refresh fetches', async () => {
    const serverJwt = makeTestJwt(Math.floor(Date.now() / 1000) + 3600)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: serverJwt, expires_in: 3600 }),
    } as Response)

    await exchangeGoogleIdTokenForServerAccessToken({
      apiBaseUrl: 'http://127.0.0.1:8000',
      idToken: 'google-id-token',
    })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/auth/google',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )

    await refreshServerAccessToken({
      apiBaseUrl: 'http://127.0.0.1:8000',
      accessToken: serverJwt,
    })
    expect(fetch).toHaveBeenLastCalledWith(
      'http://127.0.0.1:8000/api/v1/auth/token',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('rejects when auth fetch is aborted by timeout', async () => {
    vi.mocked(fetch).mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error('expected AbortSignal'))
          return
        }
        if (signal.aborted) {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
          return
        }
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        })
      })
    })

    await expect(
      exchangeGoogleIdTokenForServerAccessToken({
        apiBaseUrl: 'http://127.0.0.1:8000',
        idToken: 'google-id-token',
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('scopes in-flight resolve by apiBaseUrl so concurrent bases do not share a promise', async () => {
    const jwtA = makeTestJwt(Math.floor(Date.now() / 1000) + 3600)
    const jwtB = makeTestJwt(Math.floor(Date.now() / 1000) + 7200)
    getTeralexiAccountGoogleIdToken.mockReturnValue('google-id-token')

    const pending = new Map<string, (value: Response) => void>()
    vi.mocked(fetch).mockImplementation((url) => {
      const href = String(url)
      return new Promise((resolve) => {
        pending.set(href, resolve)
      })
    })

    const pA = getTeralexiServerAccessToken('http://a.example:8000')
    const pB = getTeralexiServerAccessToken('http://b.example:8000')

    await vi.waitFor(() => expect(pending.size).toBe(2))

    pending.get('http://a.example:8000/api/v1/auth/google')!({
      ok: true,
      json: async () => ({ access_token: jwtA, expires_in: 3600 }),
    } as Response)
    pending.get('http://b.example:8000/api/v1/auth/google')!({
      ok: true,
      json: async () => ({ access_token: jwtB, expires_in: 7200 }),
    } as Response)

    await expect(pA).resolves.toBe(jwtA)
    await expect(pB).resolves.toBe(jwtB)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
