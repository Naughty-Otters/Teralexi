import { createHash } from 'crypto'
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { join, resolve } from 'path'
import type { Metafile } from 'esbuild'
import { SKILL_MODULE } from './constants'

export const SKILL_MODULE_FINGERPRINT_SUFFIX = '.fingerprint.json'

export type SkillModuleBundleFingerprint = {
  inputs: Record<string, number>
}

export function skillModuleCacheDir(): string {
  return join(process.cwd(), SKILL_MODULE.CACHE_DIR)
}

export function skillModuleFingerprintPath(outJs: string): string {
  return `${outJs}${SKILL_MODULE_FINGERPRINT_SUFFIX}`
}

export function entryCacheKey(filepath: string): string {
  const st = statSync(filepath)
  return createHash('sha256')
    .update(filepath)
    .update(String(st.mtimeMs))
    .digest('hex')
    .slice(0, 40)
}

export function fingerprintFromMetafile(metafile: Metafile): SkillModuleBundleFingerprint {
  const inputs: Record<string, number> = {}
  for (const inputPath of Object.keys(metafile.inputs)) {
    if (!existsSync(inputPath)) continue
    inputs[inputPath] = statSync(inputPath).mtimeMs
  }
  return { inputs }
}

export function isSkillModuleBundleStale(
  fingerprint: SkillModuleBundleFingerprint,
): boolean {
  for (const [inputPath, recordedMtime] of Object.entries(fingerprint.inputs)) {
    if (!existsSync(inputPath)) return true
    if (statSync(inputPath).mtimeMs !== recordedMtime) return true
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
  } catch {
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
  const root = process.cwd()
  return {
    '@main': resolve(root, 'src/main'),
    '@config': resolve(root, 'config'),
    '@shared': resolve(root, 'src/shared'),
    '@toolSet': resolve(root, 'toolSet'),
    '@logging': resolve(root, 'src/logging'),
    '@openfde-ai': resolve(root, 'src/openfde-ai'),
  }
}
