import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  latestPublishableSiteDirMock,
  publishStaticSiteDirectoryMock,
  appendWebsitePublishedSessionTipMock,
  getTeralexiBaseApiUrlMock,
  getTeralexiServerAccessTokenMock,
  getEntitlementCacheMock,
  hasCachedEntitlementFeatureMock,
} = vi.hoisted(() => ({
  latestPublishableSiteDirMock: vi.fn(),
  publishStaticSiteDirectoryMock: vi.fn(),
  appendWebsitePublishedSessionTipMock: vi.fn(() => ({ ok: true, messageId: 'tip-1' })),
  getTeralexiBaseApiUrlMock: vi.fn(() => 'http://localhost:8000'),
  getTeralexiServerAccessTokenMock: vi.fn(async () => 'tok'),
  getEntitlementCacheMock: vi.fn(() => ({
    features: ['app.web.publish'],
  })),
  hasCachedEntitlementFeatureMock: vi.fn(() => true),
}))

vi.mock('./publish-site-resolve', () => ({
  latestPublishableSiteDir: latestPublishableSiteDirMock,
}))

vi.mock('@main/services/app-web-publish-client', () => ({
  publishStaticSiteDirectory: publishStaticSiteDirectoryMock,
}))

vi.mock('@main/services/app-web-publish-session-tip', () => ({
  appendWebsitePublishedSessionTip: appendWebsitePublishedSessionTipMock,
}))

vi.mock('@main/services/teralexi-platform-config', () => ({
  getTeralexiBaseApiUrl: getTeralexiBaseApiUrlMock,
}))

vi.mock('@main/services/teralexi-server-auth', () => ({
  getTeralexiServerAccessToken: getTeralexiServerAccessTokenMock,
}))

vi.mock('@main/services/entitlement-store', () => ({
  getEntitlementCache: getEntitlementCacheMock,
}))

vi.mock('@main/agent/sandbox/registry', () => ({
  resolveSandboxRootForConversation: vi.fn(() => '/tmp/sandbox'),
}))

vi.mock('@shared/subscription/entitlement-features', () => ({
  hasCachedEntitlementFeature: (...args: unknown[]) =>
    hasCachedEntitlementFeatureMock(...args),
}))

import { publishWebsiteComposerPlugin } from './composer-toolbar-plugins'

const ctx = {
  skillId: 'website',
  conversationId: 'conv-1',
  workspacePath: '/tmp/ws',
}

describe('publishWebsiteComposerPlugin', () => {
  let siteDir: string

  beforeEach(() => {
    siteDir = mkdtempSync(join(tmpdir(), 'publish-preview-'))
    writeFileSync(join(siteDir, 'index.html'), '<html></html>', 'utf8')
    mkdirSync(join(siteDir, 'css'), { recursive: true })
    writeFileSync(join(siteDir, 'css', 'a.css'), 'body{}', 'utf8')
    latestPublishableSiteDirMock.mockReturnValue(siteDir)
    publishStaticSiteDirectoryMock.mockReset()
    appendWebsitePublishedSessionTipMock.mockReset()
    appendWebsitePublishedSessionTipMock.mockReturnValue({
      ok: true,
      messageId: 'tip-1',
    })
    getTeralexiServerAccessTokenMock.mockResolvedValue('tok')
    hasCachedEntitlementFeatureMock.mockReturnValue(true)
    getTeralexiBaseApiUrlMock.mockReturnValue('http://localhost:8000')
  })

  afterEach(() => {
    rmSync(siteDir, { recursive: true, force: true })
  })

  it('preview returns site files and upload target', async () => {
    const preview = await publishWebsiteComposerPlugin.preview!({
      ...ctx,
      workspacePath: siteDir,
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.siteDir).toBe(siteDir)
    expect(preview.fileCount).toBe(2)
    expect(preview.sampleFiles).toEqual(
      expect.arrayContaining(['css/a.css', 'index.html']),
    )
    expect(preview.truncatedRemaining).toBe(0)
    expect(preview.targetHost).toBe('localhost:8000')
    expect(preview.uploadPath).toBe('api/v1/app/web/upload')
  })

  it('preview truncates sampleFiles after 20 entries', async () => {
    for (let i = 0; i < 25; i++) {
      writeFileSync(join(siteDir, `f${String(i).padStart(2, '0')}.txt`), 'x', 'utf8')
    }
    const preview = await publishWebsiteComposerPlugin.preview!({
      ...ctx,
      workspacePath: siteDir,
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.sampleFiles).toHaveLength(20)
    expect(preview.fileCount).toBe(27) // index + css + 25
    expect(preview.truncatedRemaining).toBe(7)
  })

  it('preview fails when no publishable site exists', async () => {
    latestPublishableSiteDirMock.mockReturnValue(null)
    const preview = await publishWebsiteComposerPlugin.preview!(ctx)
    expect(preview.ok).toBe(false)
    if (preview.ok) return
    expect(preview.error).toMatch(/No publishable site/i)
  })

  it('preview fails when site listing fails', async () => {
    latestPublishableSiteDirMock.mockReturnValue(join(siteDir, 'missing'))
    const preview = await publishWebsiteComposerPlugin.preview!(ctx)
    expect(preview.ok).toBe(false)
    if (preview.ok) return
    expect(preview.error).toMatch(/not found/i)
  })

  it('isEnabled requires site, sign-in, and entitlement', async () => {
    expect(await publishWebsiteComposerPlugin.isEnabled!(ctx)).toBe(true)

    latestPublishableSiteDirMock.mockReturnValue(null)
    expect(await publishWebsiteComposerPlugin.isEnabled!(ctx)).toBe(false)

    latestPublishableSiteDirMock.mockReturnValue(siteDir)
    getTeralexiServerAccessTokenMock.mockResolvedValueOnce(null)
    expect(await publishWebsiteComposerPlugin.isEnabled!(ctx)).toBe(false)

    getTeralexiServerAccessTokenMock.mockResolvedValue('tok')
    hasCachedEntitlementFeatureMock.mockReturnValueOnce(false)
    expect(await publishWebsiteComposerPlugin.isEnabled!(ctx)).toBe(false)
  })

  it('getDisabledReason covers site, sign-in, and plan gates', async () => {
    latestPublishableSiteDirMock.mockReturnValue(null)
    expect(await publishWebsiteComposerPlugin.getDisabledReason!(ctx)).toMatch(
      /No finished site/i,
    )

    latestPublishableSiteDirMock.mockReturnValue(siteDir)
    getTeralexiServerAccessTokenMock.mockResolvedValueOnce(null)
    expect(await publishWebsiteComposerPlugin.getDisabledReason!(ctx)).toMatch(
      /Sign in/i,
    )

    getTeralexiServerAccessTokenMock.mockResolvedValue('tok')
    hasCachedEntitlementFeatureMock.mockReturnValueOnce(false)
    expect(await publishWebsiteComposerPlugin.getDisabledReason!(ctx)).toMatch(
      /not included/i,
    )

    hasCachedEntitlementFeatureMock.mockReturnValue(true)
    expect(
      await publishWebsiteComposerPlugin.getDisabledReason!(ctx),
    ).toBeUndefined()
  })

  it('execute passes through URL, HTTP statuses, and counts', async () => {
    publishStaticSiteDirectoryMock.mockResolvedValue({
      ok: true,
      userId: 1,
      url: '/app/web/1/',
      absoluteUrl: 'http://localhost:8000/app/web/1/',
      fileCount: 2,
      bytes: 120,
      uploadStatus: 201,
      verifyStatus: 200,
      zipFileCount: 2,
    })

    const result = await publishWebsiteComposerPlugin.execute({
      ...ctx,
      workspacePath: siteDir,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.absoluteUrl).toBe('http://localhost:8000/app/web/1/')
    expect(result.relativeUrl).toBe('/app/web/1/')
    expect(result.uploadStatus).toBe(201)
    expect(result.verifyStatus).toBe(200)
    expect(result.fileCount).toBe(2)
    expect(result.bytes).toBe(120)
    expect(result.siteDir).toBe(siteDir)
    expect(publishStaticSiteDirectoryMock).toHaveBeenCalledWith({
      siteDir,
      verify: true,
    })
    expect(appendWebsitePublishedSessionTipMock).toHaveBeenCalledWith({
      conversationId: ctx.conversationId,
      absoluteUrl: 'http://localhost:8000/app/web/1/',
    })
  })

  it('execute fails when no site is found', async () => {
    latestPublishableSiteDirMock.mockReturnValue(null)
    const result = await publishWebsiteComposerPlugin.execute(ctx)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/No publishable site/i)
    expect(publishStaticSiteDirectoryMock).not.toHaveBeenCalled()
    expect(appendWebsitePublishedSessionTipMock).not.toHaveBeenCalled()
  })

  it('execute surfaces publish API failures with uploadStatus', async () => {
    publishStaticSiteDirectoryMock.mockResolvedValue({
      ok: false,
      error: 'Weekly publish limit reached',
      code: 'weekly_limit',
      status: 303,
    })
    const result = await publishWebsiteComposerPlugin.execute(ctx)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Weekly publish limit/i)
    expect(result.uploadStatus).toBe(303)
    expect(result.siteDir).toBe(siteDir)
    expect(appendWebsitePublishedSessionTipMock).not.toHaveBeenCalled()
  })
})
