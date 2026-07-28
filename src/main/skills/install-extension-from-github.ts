import { execFile } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { existsSync, readdirSync, statSync } from 'node:fs'
import {
  resolveProjectExtensionsDirectory,
  resolveUserExtensionsDirectory,
} from './skill-path'
import { EXTENSION_FILES } from './constants'

const execFileAsync = promisify(execFile)

export type InstallExtensionResult =
  | { ok: true; extensionId: string; path: string }
  | { ok: false; error: string }

function parseGithubUrl(url: string): {
  cloneUrl: string
  subPath: string
  defaultId: string
} | null {
  const trimmed = url.trim()
  const treeMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+(?:\/(.+))?)?\/?$/i,
  )
  if (treeMatch) {
    const [, owner, repo, subPath = ''] = treeMatch
    return {
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      subPath: subPath.replace(/\/$/, ''),
      defaultId: subPath ? basename(subPath) : repo,
    }
  }
  const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/)
  if (shortMatch) {
    const [, owner, repo] = shortMatch
    return {
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      subPath: '',
      defaultId: repo,
    }
  }
  return null
}

function hasExtensionManifest(dir: string): boolean {
  return existsSync(join(dir, EXTENSION_FILES.MANIFEST_JSON))
}

function walkForExtensionRoot(root: string, depth = 0): string | null {
  if (depth > 5) return null
  if (hasExtensionManifest(root)) return root
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return null
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const folder = join(root, entry)
    try {
      if (!statSync(folder).isDirectory()) continue
    } catch {
      continue
    }
    const hit = walkForExtensionRoot(folder, depth + 1)
    if (hit) return hit
  }
  return null
}

async function findExtensionRoot(
  cloneDir: string,
  subPath: string,
): Promise<string | null> {
  const preferred = subPath ? join(cloneDir, subPath) : cloneDir
  if (hasExtensionManifest(preferred)) return preferred

  const underExt = join(cloneDir, 'extensions', basename(subPath) || '')
  if (subPath && hasExtensionManifest(underExt)) return underExt

  const extensionsDir = join(cloneDir, 'extensions')
  if (existsSync(extensionsDir)) {
    for (const entry of readdirSync(extensionsDir)) {
      const folder = join(extensionsDir, entry)
      try {
        if (!statSync(folder).isDirectory()) continue
      } catch {
        continue
      }
      if (hasExtensionManifest(folder)) return folder
    }
  }

  return walkForExtensionRoot(cloneDir)
}

/**
 * Install an extension from a GitHub URL / owner/repo into
 * `~/.teralexi/extensions` (or project `.teralexi/extensions` when requested).
 * CLI (`npx teralexi-ai extension install`) is the primary surface; this mirrors
 * that behavior for the desktop/main process.
 */
export async function installExtensionFromGithub(args: {
  url: string
  extensionId?: string
  /** When set, install under `<workspace>/.teralexi/extensions`. */
  workspacePath?: string
}): Promise<InstallExtensionResult> {
  const parsed = parseGithubUrl(args.url)
  if (!parsed) {
    return {
      ok: false,
      error:
        'Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo.',
    }
  }

  const extensionId = (args.extensionId?.trim() || parsed.defaultId).replace(
    /[^a-zA-Z0-9_-]/g,
    '-',
  )
  if (!extensionId) return { ok: false, error: 'extensionId is required' }

  const tempDir = await mkdtemp(join(tmpdir(), 'teralexi-extension-'))
  try {
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', parsed.cloneUrl, tempDir],
      { timeout: 120_000 },
    )
    const extensionRoot = await findExtensionRoot(tempDir, parsed.subPath)
    if (!extensionRoot) {
      return { ok: false, error: 'No extension.json found in repository.' }
    }

    const destRoot = args.workspacePath?.trim()
      ? resolveProjectExtensionsDirectory(args.workspacePath) ??
        resolveUserExtensionsDirectory()
      : resolveUserExtensionsDirectory()
    const dest = join(destRoot, extensionId)
    await cp(extensionRoot, dest, { recursive: true, force: true })
    return { ok: true, extensionId, path: dest }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
