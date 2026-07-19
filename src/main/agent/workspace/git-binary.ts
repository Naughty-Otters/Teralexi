/**
 * Resolve the git executable used by the UI panel and agent tools.
 *
 * Prefer a bundled portable Git when present (customer machines may not have
 * Git on PATH). Otherwise fall back to system `git`.
 *
 * Bundle layout (when shipped via electron-builder extraResources → Resources/git):
 *   Resources/git/bin/git      (macOS / Linux)
 *   Resources/git/cmd/git.exe  (Windows)
 * Dev / override:
 *   vendor/git/bin/git
 *   TERALEXI_GIT_PATH env
 */
import { existsSync } from 'fs'
import { join } from 'path'

export const GIT_NOT_FOUND_MESSAGE =
  'git executable not found. Install Git, or ship a bundled Git under Resources/git.'

function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

function bundledGitCandidates(): string[] {
  const isWin = process.platform === 'win32'
  const gitName = isWin ? 'git.exe' : 'git'
  const roots: string[] = []

  // Packaged Electron sets process.resourcesPath to Contents/Resources (mac)
  // or resources/ (win/linux). Missing paths are skipped by firstExisting.
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    roots.push(process.resourcesPath)
  }

  // Unpackaged / CI: optional local vendor tree (same layout as Resources/git).
  roots.push(join(process.cwd(), 'vendor'))

  const candidates: string[] = []
  for (const root of roots) {
    const gitRoot = join(root, 'git')
    if (isWin) {
      candidates.push(
        join(gitRoot, 'cmd', gitName),
        join(gitRoot, 'bin', gitName),
        join(gitRoot, 'mingw64', 'bin', gitName),
      )
    } else {
      candidates.push(join(gitRoot, 'bin', gitName))
    }
  }
  return candidates
}

let cachedGitBinary: string | null | undefined

/** Clear cached path (tests). */
export function resetGitBinaryCache(): void {
  cachedGitBinary = undefined
}

/**
 * Absolute path to a known git binary, or the bare command name `git` for PATH
 * lookup. Result is cached for the process lifetime.
 */
export function resolveGitBinary(): string {
  if (cachedGitBinary !== undefined) return cachedGitBinary

  const fromEnv = process.env.TERALEXI_GIT_PATH?.trim()
  if (fromEnv && existsSync(fromEnv)) {
    cachedGitBinary = fromEnv
    return cachedGitBinary
  }

  const bundled = firstExisting(bundledGitCandidates())
  if (bundled) {
    cachedGitBinary = bundled
    return cachedGitBinary
  }

  cachedGitBinary = 'git'
  return cachedGitBinary
}

export function isGitNotFoundError(error: string): boolean {
  const lower = error.toLowerCase()
  return (
    lower.includes('enoent') ||
    lower.includes('git executable not found') ||
    lower.includes('spawn git') ||
    /not recognized as an internal or external command/i.test(error)
  )
}

export function isNotAGitRepositoryError(error: string): boolean {
  return /not a git repository/i.test(error)
}
