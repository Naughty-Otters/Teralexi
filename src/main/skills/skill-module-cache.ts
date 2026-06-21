import { createHash } from 'crypto'
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, resolve } from 'path'
import type { Metafile } from 'esbuild'
import {
  isPackagedApp,
  resolveAppRoot,
  toOnDiskAppPath,
} from '@main/config/app-paths'
import { createLogger } from '@main/logger'
import { SKILL_MODULE } from './constants'

export { resolveAppRoot, toOnDiskAppPath } from '@main/config/app-paths'

const log = createLogger('skills.module-cache')

function relativePathFromAppRoot(absPath: string): string {
  const onDiskPath = toOnDiskAppPath(absPath)
  const root = resolveAppRoot()
  if (onDiskPath.startsWith(root)) {
    return onDiskPath.slice(root.length).replace(/^[/\\]+/, '')
  }
  return onDiskPath
}

function resolveFingerprintInputPath(key: string): string {
  if (key.startsWith('/') || /^[A-Za-z]:[\\/]/.test(key)) {
    return toOnDiskAppPath(key)
  }
  return join(resolveAppRoot(), key)
}

export function skillModuleCacheDir(): string {
  const override = process.env.OPENFDE_SKILL_MODULE_CACHE_DIR?.trim()
  if (override) return override
  if (isPackagedApp()) {
    return join(resolveAppRoot(), SKILL_MODULE.PACKAGED_CACHE_DIR)
  }
  return join(process.cwd(), SKILL_MODULE.CACHE_DIR)
}

export function skillModuleFingerprintPath(outJs: string): string {
  return `${outJs}${SKILL_MODULE_FINGERPRINT_SUFFIX}`
}

export const SKILL_MODULE_FINGERPRINT_SUFFIX = '.fingerprint.json'

export type SkillModuleBundleFingerprint = {
  inputs: Record<string, number>
}

export function entryCacheKey(filepath: string): string {
  const onDiskPath = toOnDiskAppPath(filepath)
  const rel = relativePathFromAppRoot(onDiskPath)
  return createHash('sha256').update(rel).digest('hex').slice(0, 40)
}

export function fingerprintFromMetafile(metafile: Metafile): SkillModuleBundleFingerprint {
  const inputs: Record<string, number> = {}
  for (const inputPath of Object.keys(metafile.inputs)) {
    const onDiskPath = toOnDiskAppPath(inputPath)
    if (!existsSync(onDiskPath)) continue
    inputs[relativePathFromAppRoot(onDiskPath)] = statSync(onDiskPath).mtimeMs
  }
  return { inputs }
}

export function isSkillModuleBundleStale(
  fingerprint: SkillModuleBundleFingerprint,
): boolean {
  for (const [inputPath, recordedMtime] of Object.entries(fingerprint.inputs)) {
    const absPath = resolveFingerprintInputPath(inputPath)
    if (!existsSync(absPath)) return true
    if (statSync(absPath).mtimeMs !== recordedMtime) return true
  }
  return false
}

export function readSkillModuleBundleFingerprint(
  outJs: string,
): SkillModuleBundleFingerprint | null {
  const fingerprintPath = skillModuleFingerprintPath(outJs)
  if (!existsSync(fingerprintPath)) return null
  try {
    return JSON.parse(
      readFileSync(fingerprintPath, 'utf8'),
    ) as SkillModuleBundleFingerprint
  } catch (err) {
    log.warn('Failed to read skill module cache fingerprint; will rebuild bundle', {
      outJs,
      fingerprintPath,
      err,
    })
    return null
  }
}

export function writeSkillModuleBundleFingerprint(
  outJs: string,
  fingerprint: SkillModuleBundleFingerprint,
): void {
  writeFileSync(
    skillModuleFingerprintPath(outJs),
    JSON.stringify(fingerprint),
    'utf8',
  )
}

export function shouldRebuildSkillModuleBundle(outJs: string): boolean {
  if (!existsSync(outJs)) return true
  if (isPackagedApp()) {
    return !existsSync(skillModuleFingerprintPath(outJs))
  }
  const fingerprint = readSkillModuleBundleFingerprint(outJs)
  if (!fingerprint) return true
  return isSkillModuleBundleStale(fingerprint)
}

/** Removes all cached esbuild skill/toolSet bundles (forces rebuild on next load). */
export function clearSkillModuleCache(): void {
  const cacheDir = skillModuleCacheDir()
  if (!existsSync(cacheDir)) return
  rmSync(cacheDir, { recursive: true, force: true })
}

export function esbuildPathAliases(): Record<string, string> {
  const root = resolveAppRoot()
  return {
    '@main': resolve(root, 'src/main'),
    '@config': resolve(root, 'config'),
    '@shared': resolve(root, 'src/shared'),
    '@toolSet': resolve(root, 'toolSet'),
    '@logging': resolve(root, 'src/logging'),
    '@openfde-ai': resolve(root, 'src/openfde-ai'),
  }
}

/** Load esbuild from the unpacked app bundle so the native binary can spawn. */
export function resolveEsbuildForSkillCompile(): typeof import('esbuild') {
  if (!isPackagedApp()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('esbuild')
  }

  const root = resolveAppRoot()
  const esbuildPkg = join(root, 'node_modules', 'esbuild')
  const binaryCandidates = [
    join(esbuildPkg, 'bin', 'esbuild'),
    join(
      esbuildPkg,
      'node_modules',
      '@esbuild',
      `${process.platform}-${process.arch}`,
      'bin',
      'esbuild',
    ),
    join(root, 'node_modules', '@esbuild', `${process.platform}-${process.arch}`, 'bin', 'esbuild'),
  ]

  for (const binaryPath of binaryCandidates) {
    if (existsSync(binaryPath)) {
      process.env.ESBUILD_BINARY_PATH = binaryPath
      break
    }
  }

  if (!existsSync(join(esbuildPkg, 'package.json'))) {
    log.warn('Unpacked esbuild package missing; using default module resolution', {
      esbuildPkg,
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('esbuild')
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(esbuildPkg)
}

/**
 * Load a cached CJS bundle using the main-process `require` so nested imports
 * resolve against the app (asar node_modules, Electron builtins). Plain
 * `require(cacheFile)` resolves from ~/.openfde and fails when packaged.
 */
export function loadCachedCommonJsModule(
  filepath: string,
): Record<string, unknown> {
  const code = readFileSync(filepath, 'utf8')
  const cjsModule: { exports: Record<string, unknown> } = { exports: {} }
  const runner = new Function(
    'require',
    'module',
    'exports',
    '__filename',
    '__dirname',
    code,
  ) as (
    req: NodeRequire,
    mod: { exports: Record<string, unknown> },
    exports: Record<string, unknown>,
    filename: string,
    dirname: string,
  ) => void
  runner(require, cjsModule, cjsModule.exports, filepath, dirname(filepath))
  return cjsModule.exports
}
