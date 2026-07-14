import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import AdmZip from 'adm-zip'

export const APP_WEB_SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.teralexi',
])

const SECRET_FILE_RE =
  /(?:^\.env(?:\.|$)|(?:^|[/\\])(?:id_rsa|id_ed25519|id_ecdsa)(?:$|\.)|\.(?:pem|p12|pfx|key)$)/i

export type ZipStaticSiteResult =
  | { ok: true; buffer: Buffer; fileCount: number; bytes: number }
  | { ok: false; error: string }

function hasRootLandingPage(siteDir: string): boolean {
  return (
    existsSync(join(siteDir, 'index.html')) ||
    existsSync(join(siteDir, 'index.htm'))
  )
}

function shouldSkipFile(relPosix: string, name: string): boolean {
  if (name === '.DS_Store' || name === 'Thumbs.db') return true
  if (SECRET_FILE_RE.test(relPosix) || SECRET_FILE_RE.test(name)) return true
  return false
}

/**
 * Build a zip of a static site directory with files at the **archive root**
 * (required by `/api/v1/app/web/upload`).
 */
export function zipStaticSiteDirectory(siteDir: string): ZipStaticSiteResult {
  const root = siteDir.trim()
  if (!root) return { ok: false, error: 'Site directory path is empty.' }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return { ok: false, error: `Site directory not found: ${root}` }
  }
  if (!hasRootLandingPage(root)) {
    return {
      ok: false,
      error:
        'Site directory must include index.html or index.htm at the root (not only under a subdirectory such as dist/).',
    }
  }

  const zip = new AdmZip()
  let fileCount = 0

  const walk = (current: string) => {
    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const abs = join(current, entry.name)
      const rel = relative(root, abs)
      const relPosix = rel.split(sep).join('/')

      if (entry.isDirectory()) {
        if (APP_WEB_SKIP_DIR_NAMES.has(entry.name)) continue
        walk(abs)
        continue
      }
      if (!entry.isFile()) continue
      if (shouldSkipFile(relPosix, entry.name)) continue

      zip.addFile(relPosix, readFileSync(abs))
      fileCount += 1
    }
  }

  walk(root)

  if (fileCount === 0) {
    return { ok: false, error: 'Site directory has no files to publish.' }
  }

  const buffer = zip.toBuffer()
  return { ok: true, buffer, fileCount, bytes: buffer.byteLength }
}

export function assertZipHasRootLandingPage(buffer: Buffer): boolean {
  const zip = new AdmZip(buffer)
  const names = new Set(
    zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/')),
  )
  return names.has('index.html') || names.has('index.htm')
}

export function zipDisplayName(siteDir: string): string {
  const base = basename(siteDir.trim()) || 'site'
  return `${base}.zip`
}
