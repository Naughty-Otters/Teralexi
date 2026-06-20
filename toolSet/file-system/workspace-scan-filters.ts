import { z } from 'zod'

/**
 * Dependency / virtualenv directories skipped when `include_package_files` is false.
 * Hidden paths (any segment starting with `.`) are skipped separately.
 */
export const PACKAGE_SKIP_DIR_NAMES = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  '.yarn',
  '.pnpm-store',
  'venv',
  '.venv',
  'site-packages',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  '.eggs',
  'Pods',
  'Carthage',
])

export const includePackageFilesField = z
  .boolean()
  .optional()
  .default(false)
  .describe(
    'When false (default), exclude node_modules, Python package dirs, and hidden files from results.',
  )

export function parseIncludePackageFiles(input: Record<string, unknown>): boolean {
  return Boolean(input['include_package_files'])
}

export function shouldSkipListingEntry(
  name: string,
  isDirectory: boolean,
  includePackageFiles: boolean,
): boolean {
  if (includePackageFiles) return false
  if (name.startsWith('.')) return true
  if (isDirectory && PACKAGE_SKIP_DIR_NAMES.has(name)) return true
  return false
}

/** True when a relative or absolute path should be omitted from scan results. */
export function shouldSkipRelativePath(
  relPath: string,
  includePackageFiles: boolean,
): boolean {
  if (includePackageFiles) return false
  const normalized = relPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  for (const seg of segments) {
    if (seg.startsWith('.')) return true
    if (PACKAGE_SKIP_DIR_NAMES.has(seg)) return true
  }
  return false
}

/** Ripgrep `-g` negation globs for package and hidden paths. */
export function ripgrepExcludeGlobArgs(includePackageFiles: boolean): string[] {
  if (includePackageFiles) return []
  const args: string[] = []
  for (const dir of PACKAGE_SKIP_DIR_NAMES) {
    args.push('-g', `!**/${dir}/**`)
  }
  args.push('-g', '!**/.*')
  args.push('-g', '!**/.*/**')
  return args
}

/** fast-glob `ignore` patterns matching {@link ripgrepExcludeGlobArgs}. */
export function fastGlobIgnorePatterns(includePackageFiles: boolean): string[] {
  if (includePackageFiles) return []
  return [
    ...[...PACKAGE_SKIP_DIR_NAMES].map((dir) => `**/${dir}/**`),
    '**/.*',
    '**/.*/**',
  ]
}
