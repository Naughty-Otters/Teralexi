import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const publishStaticSiteDirectory = vi.hoisted(() => vi.fn())

vi.mock('@teralexi/skill-sdk', async () => {
  const actual = await vi.importActual<typeof import('@teralexi/skill-sdk')>(
    '@teralexi/skill-sdk',
  )
  return {
    ...actual,
    requireActiveSandbox: () => ({ ok: true, root: '/sandbox' }),
    getWorkspacePathFromEnv: () => null,
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

  it('errors when path missing', async () => {
    const result = (await publishWebsite.execute({})) as { error?: string }
    expect(result.error).toMatch(/path is required/i)
  })
})
