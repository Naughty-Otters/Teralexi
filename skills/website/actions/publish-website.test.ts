import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const publishStaticSiteDirectory = vi.hoisted(() => vi.fn())
const requireActiveSandbox = vi.hoisted(() =>
  vi.fn(() => ({ ok: true as const, root: '/sandbox' })),
)
const getWorkspacePathFromEnv = vi.hoisted(() => vi.fn(() => null as string | null))

vi.mock('@teralexi/skill-sdk', async () => {
  const actual = await vi.importActual<typeof import('@teralexi/skill-sdk')>(
    '@teralexi/skill-sdk',
  )
  return {
    ...actual,
    requireActiveSandbox: (...args: unknown[]) => requireActiveSandbox(...args),
    getWorkspacePathFromEnv: (...args: unknown[]) =>
      getWorkspacePathFromEnv(...args),
    resolvePathAllowingOutside: (_root: string, userPath: string) => userPath,
    publishStaticSiteDirectory,
  }
})

import { publishWebsite } from './publish-website'

describe('publish_website tool', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'publish-website-tool-'))
    writeFileSync(join(dir, 'index.html'), '<html lang="en"><title>T</title></html>')
    publishStaticSiteDirectory.mockReset()
    requireActiveSandbox.mockReset()
    requireActiveSandbox.mockReturnValue({ ok: true, root: '/sandbox' })
    getWorkspacePathFromEnv.mockReset()
    getWorkspacePathFromEnv.mockReturnValue(null)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns absolute URL on success', async () => {
    publishStaticSiteDirectory.mockResolvedValue({
      ok: true,
      userId: 7,
      url: '/app/web/7/',
      absoluteUrl: 'http://localhost:8000/app/web/7/',
      fileCount: 1,
      bytes: 12,
      zipFileCount: 1,
    })

    const result = (await publishWebsite.execute({ path: dir })) as Record<
      string,
      unknown
    >
    expect(result.ok).toBe(true)
    expect(result.absoluteUrl).toBe('http://localhost:8000/app/web/7/')
    expect(publishStaticSiteDirectory).toHaveBeenCalledWith({
      siteDir: dir,
      verify: false,
    })
  })

  it('surfaces entitlement denial from client', async () => {
    publishStaticSiteDirectory.mockResolvedValue({
      ok: false,
      code: 'feature_missing',
      status: 403,
      error: 'plan lacks publish',
    })

    const result = (await publishWebsite.execute({ path: dir })) as {
      success?: boolean
      error?: string
      code?: string
    }
    expect(result.success).toBe(false)
    expect(result.code).toBe('feature_missing')
    expect(result.error).toMatch(/plan lacks publish/)
  })

  it('auto-discovers a sandbox site when path is omitted', async () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), 'publish-website-sb-'))
    const siteDir = join(sandboxRoot, 'output', 'results', 'auto-site')
    mkdirSync(siteDir, { recursive: true })
    writeFileSync(join(siteDir, 'index.html'), '<html lang="en"></html>')
    requireActiveSandbox.mockReturnValue({ ok: true, root: sandboxRoot })

    publishStaticSiteDirectory.mockResolvedValue({
      ok: true,
      userId: 3,
      url: '/app/web/3/',
      absoluteUrl: 'http://localhost:8000/app/web/3/',
      fileCount: 1,
      bytes: 20,
      zipFileCount: 1,
    })

    try {
      const result = (await publishWebsite.execute({})) as {
        ok?: boolean
        absoluteUrl?: string
        site_dir?: string
      }
      expect(result.ok).toBe(true)
      expect(result.absoluteUrl).toBe('http://localhost:8000/app/web/3/')
      expect(result.site_dir).toBe(siteDir)
      expect(publishStaticSiteDirectory).toHaveBeenCalledWith({
        siteDir,
        verify: true,
      })
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true })
    }
  })

  it('errors when path omitted and no site can be discovered', async () => {
    const result = (await publishWebsite.execute({})) as { error?: string }
    expect(result.error).toMatch(/No publishable site found/i)
  })
})
