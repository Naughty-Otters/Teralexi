import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const {
  getEntitlementCacheMock,
  getTeralexiBaseApiUrlMock,
  getTeralexiServerAccessTokenMock,
} = vi.hoisted(() => ({
  getEntitlementCacheMock: vi.fn(),
  getTeralexiBaseApiUrlMock: vi.fn(() => 'http://localhost:8000'),
  getTeralexiServerAccessTokenMock: vi.fn(async () => 'tok-test'),
}))

vi.mock('./entitlement-store', () => ({
  getEntitlementCache: getEntitlementCacheMock,
}))

vi.mock('./teralexi-platform-config', () => ({
  getTeralexiBaseApiUrl: getTeralexiBaseApiUrlMock,
}))

vi.mock('./teralexi-server-auth', () => ({
  getTeralexiServerAccessToken: getTeralexiServerAccessTokenMock,
}))

import {
  getAppWebMaxUploadBytes,
  publishStaticSiteDirectory,
  publishStaticSiteZip,
  toAbsoluteAppWebUrl,
} from './app-web-publish-client'
import {
  assertZipHasRootLandingPage,
  zipStaticSiteDirectory,
} from './app-web-site-zip'
import { ENTITLEMENT_FEATURES } from '@shared/subscription/entitlement-types'

function entitlementWithPublish(
  limits: Record<string, unknown> = {},
): void {
  getEntitlementCacheMock.mockReturnValue({
    features: [ENTITLEMENT_FEATURES.APP_WEB_PUBLISH],
    limits,
    plan: 'base',
    planName: 'Base',
    status: 'active',
    revision: 1,
    entitlementToken: 'e',
    teralexiUserId: 'u1',
    fetchedAt: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  })
}

describe('app-web-site-zip', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-web-zip-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('zips with index.html at archive root and skips secrets/node_modules', () => {
    writeFileSync(join(dir, 'index.html'), '<html lang="en"><title>Hi</title></html>')
    writeFileSync(join(dir, 'styles.css'), 'body{}')
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'x', 'index.js'), 'module.exports=1')
    writeFileSync(join(dir, '.env'), 'SECRET=1')
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)')

    const result = zipStaticSiteDirectory(dir)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(assertZipHasRootLandingPage(result.buffer)).toBe(true)
    expect(result.fileCount).toBe(3)
  })

  it('rejects directory without root landing page', () => {
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'index.html'), '<html></html>')
    const result = zipStaticSiteDirectory(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/index\.html/i)
  })
})

describe('app-web-publish-client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    getTeralexiBaseApiUrlMock.mockReturnValue('http://localhost:8000')
    getTeralexiServerAccessTokenMock.mockResolvedValue('tok-test')
    entitlementWithPublish()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads max upload bytes from entitlement limits with default fallback', () => {
    expect(getAppWebMaxUploadBytes({})).toBe(4_194_304)
    expect(getAppWebMaxUploadBytes({ app_web_max_upload_bytes: 1024 })).toBe(1024)
    expect(toAbsoluteAppWebUrl('/app/web/42/', 'http://localhost:8000')).toBe(
      'http://localhost:8000/app/web/42/',
    )
  })

  it('publishes zip and returns absolute URL on 200', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        user_id: 42,
        url: '/app/web/42/',
        file_count: 2,
        bytes: 99,
      }),
      text: async () => '',
      headers: new Headers(),
    })

    const result = await publishStaticSiteZip({
      zipBuffer: Buffer.from('fake-zip'),
      filename: 'site.zip',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.absoluteUrl).toBe('http://localhost:8000/app/web/42/')
    expect(result.fileCount).toBe(2)
    expect(result.uploadStatus).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/app/web/upload',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
    )
  })

  it('maps weekly limit 303', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 303,
      headers: new Headers({ Location: '/app/web/limit-reached' }),
      text: async () => '',
      json: async () => ({}),
    })
    const result = await publishStaticSiteZip({ zipBuffer: Buffer.from('z') })
    expect(result).toMatchObject({ ok: false, code: 'weekly_limit', status: 303 })
  })

  it('maps size limit 413 and validation 400', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 413,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({ detail: 'upload exceeds size limit of 10 bytes' }),
      json: async () => ({}),
    })
    expect(await publishStaticSiteZip({ zipBuffer: Buffer.from('z') })).toMatchObject({
      ok: false,
      code: 'size_limit',
      status: 413,
    })

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () => JSON.stringify({ detail: 'missing root index' }),
      json: async () => ({}),
    })
    expect(await publishStaticSiteZip({ zipBuffer: Buffer.from('z') })).toMatchObject({
      ok: false,
      code: 'validation',
      status: 400,
    })
  })

  it('rejects when feature missing or not signed in', async () => {
    getEntitlementCacheMock.mockReturnValue({
      features: [],
      limits: {},
      plan: 'base',
      planName: 'Base',
      status: 'active',
      revision: 1,
      entitlementToken: 'e',
      teralexiUserId: 'u1',
      fetchedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(await publishStaticSiteZip({ zipBuffer: Buffer.from('z') })).toMatchObject({
      ok: false,
      code: 'feature_missing',
    })

    entitlementWithPublish()
    getTeralexiServerAccessTokenMock.mockResolvedValueOnce(null)
    expect(await publishStaticSiteZip({ zipBuffer: Buffer.from('z') })).toMatchObject({
      ok: false,
      code: 'not_signed_in',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('publishStaticSiteDirectory returns uploadStatus and verifyStatus', async () => {
    const siteDir = mkdtempSync(join(tmpdir(), 'app-web-publish-dir-'))
    try {
      writeFileSync(join(siteDir, 'index.html'), '<html></html>', 'utf8')
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            user_id: 7,
            url: '/app/web/7/',
            file_count: 1,
            bytes: 12,
          }),
          text: async () => '',
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<html></html>',
        })

      const result = await publishStaticSiteDirectory({
        siteDir,
        verify: true,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.uploadStatus).toBe(201)
      expect(result.verifyStatus).toBe(200)
      expect(result.absoluteUrl).toBe('http://localhost:8000/app/web/7/')
      expect(result.zipFileCount).toBe(1)
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8000/app/web/7/',
        { method: 'GET' },
      )
    } finally {
      rmSync(siteDir, { recursive: true, force: true })
    }
  })

  it('passes AbortSignal on publish upload fetch', async () => {
    entitlementWithPublish()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        user_id: 1,
        url: '/app/web/1/',
        file_count: 1,
        bytes: 1,
      }),
      text: async () => '',
      headers: new Headers(),
    })

    await publishStaticSiteZip({ zipBuffer: Buffer.from('z') })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/app/web/upload',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('returns network timeout error when publish fetch is aborted', async () => {
    entitlementWithPublish()
    fetchMock.mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error('expected AbortSignal'))
          return
        }
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        })
      })
    })

    const result = await publishStaticSiteZip({
      zipBuffer: Buffer.from('z'),
      timeoutMs: 1,
    })
    expect(result).toMatchObject({
      ok: false,
      code: 'network',
      error: expect.stringMatching(/timed out/i),
    })
  })
})
