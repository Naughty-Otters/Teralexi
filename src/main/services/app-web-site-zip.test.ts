import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listStaticSiteFiles,
  zipStaticSiteDirectory,
} from './app-web-site-zip'

describe('listStaticSiteFiles', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function makeSite(files: Record<string, string>) {
    dir = mkdtempSync(join(tmpdir(), 'site-list-'))
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, body, 'utf8')
    }
    return dir
  }

  it('lists packable files with estimated bytes and skips secrets/node_modules', () => {
    const site = makeSite({
      'index.html': '<html></html>',
      'css/site.css': 'body{}',
      '.env': 'SECRET=1',
      '.env.local': 'SECRET=2',
      'keys/id_rsa': 'private',
      'cert.pem': '-----',
      'node_modules/pkg/index.js': 'module.exports={}',
      '.DS_Store': 'x',
      'Thumbs.db': 'x',
    })

    const listed = listStaticSiteFiles(site)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.files).toEqual(['css/site.css', 'index.html'])
    expect(listed.fileCount).toBe(2)
    expect(listed.estimatedBytes).toBe(
      Buffer.byteLength('<html></html>', 'utf8') + Buffer.byteLength('body{}', 'utf8'),
    )

    const zipped = zipStaticSiteDirectory(site)
    expect(zipped.ok).toBe(true)
    if (!zipped.ok) return
    expect(zipped.fileCount).toBe(listed.fileCount)
  })

  it('accepts index.htm as the landing page', () => {
    const site = makeSite({ 'index.htm': '<html></html>', 'a.txt': 'hi' })
    const listed = listStaticSiteFiles(site)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.files).toEqual(['a.txt', 'index.htm'])
  })

  it('requires root index.html or index.htm', () => {
    const site = makeSite({ 'dist/index.html': '<html></html>' })
    const listed = listStaticSiteFiles(site)
    expect(listed.ok).toBe(false)
    if (listed.ok) return
    expect(listed.error).toMatch(/index\.html/i)
  })

  it('fails for a missing directory', () => {
    const listed = listStaticSiteFiles(join(tmpdir(), 'no-such-site-dir'))
    expect(listed.ok).toBe(false)
    if (listed.ok) return
    expect(listed.error).toMatch(/not found/i)
  })

  it('fails for an empty path', () => {
    const listed = listStaticSiteFiles('   ')
    expect(listed.ok).toBe(false)
    if (listed.ok) return
    expect(listed.error).toMatch(/empty/i)
  })

  it('skips .git directories when listing', () => {
    const site = makeSite({
      'index.html': '<html></html>',
      '.git/config': '[core]',
      'ok.js': '1',
    })
    const listed = listStaticSiteFiles(site)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.files).toEqual(['index.html', 'ok.js'])
  })
})
