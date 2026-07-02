import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { stripEnvValue } from './env-overrides'

/** Gitignored local signing secrets (`env/.signing.env`). Never packaged in the app. */
export const SIGNING_ENV_FILENAME = '.signing.env'

/** Build-time signing env file — shared by sit and prod local builds. */
export function resolveCodeSigningEnvFilePaths(
  cwd = process.cwd(),
): string[] {
  return [join(cwd, 'env', SIGNING_ENV_FILENAME)]
}

/** electron-builder env vars (build-time only). */
export const ELECTRON_BUILDER_SIGNING_KEYS = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'CSC_NAME',
  'CSC_IDENTITY_AUTO_DISCOVERY',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
] as const

export type ElectronBuilderSigningKey =
  (typeof ELECTRON_BUILDER_SIGNING_KEYS)[number]

/** Friendly aliases for `env/.signing.env` and shell env (build-time only). */
export const CODE_SIGNING_ENV_ALIASES: Record<string, ElectronBuilderSigningKey> =
  {
    MAC_SIGN_CERTIFICATE: 'CSC_LINK',
    MAC_SIGN_CERTIFICATE_PASSWORD: 'CSC_KEY_PASSWORD',
    MAC_SIGN_IDENTITY: 'CSC_NAME',
    MAC_APPLE_ID: 'APPLE_ID',
    MAC_APPLE_APP_SPECIFIC_PASSWORD: 'APPLE_APP_SPECIFIC_PASSWORD',
    MAC_APPLE_TEAM_ID: 'APPLE_TEAM_ID',
    WIN_SIGN_CERTIFICATE: 'WIN_CSC_LINK',
    WIN_SIGN_CERTIFICATE_PASSWORD: 'WIN_CSC_KEY_PASSWORD',
  }

function expandHomePath(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('~/')) {
    return join(homedir(), trimmed.slice(2))
  }
  return trimmed
}

function resolveCertificatePath(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('data:')) return trimmed
  return expandHomePath(trimmed)
}

/** electron-builder CSC_NAME must omit the Keychain prefix (e.g. "Developer ID Application:"). */
export function normalizeMacSignIdentity(name: string): string {
  const trimmed = name.trim()
  const prefixes = [
    'Developer ID Application:',
    '3rd Party Mac Developer Application:',
    'Apple Development:',
  ]
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim()
    }
  }
  return trimmed
}

export function parseCodeSigningEnvFile(content: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) continue

    const rawKey = line.slice(0, eqIndex).trim()
    const rawValue = stripEnvValue(line.slice(eqIndex + 1).trim())
    const aliasTarget = CODE_SIGNING_ENV_ALIASES[rawKey]
    if (aliasTarget) {
      entries.set(aliasTarget, rawValue)
      continue
    }
    if (
      ELECTRON_BUILDER_SIGNING_KEYS.includes(
        rawKey as ElectronBuilderSigningKey,
      )
    ) {
      entries.set(rawKey, rawValue)
    }
  }
  return entries
}

export function loadCodeSigningEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): Map<string, string> {
  const merged = new Map<string, string>()
  for (const filePath of resolveCodeSigningEnvFilePaths(process.cwd())) {
    if (!existsSync(filePath)) continue
    const parsed = parseCodeSigningEnvFile(readFileSync(filePath, 'utf-8'))
    for (const [key, value] of parsed) {
      if (value !== '') merged.set(key, value)
    }
  }

  for (const key of ELECTRON_BUILDER_SIGNING_KEYS) {
    const value = processEnv[key]?.trim()
    if (value) merged.set(key, stripEnvValue(value))
  }

  for (const [alias, target] of Object.entries(CODE_SIGNING_ENV_ALIASES)) {
    const value = processEnv[alias]?.trim()
    if (value) merged.set(target, stripEnvValue(value))
  }

  return merged
}

export function isMacCodeSigningConfigured(
  env: Map<string, string> = loadCodeSigningEnv(),
): boolean {
  return Boolean(env.get('CSC_NAME')?.trim() || env.get('CSC_LINK')?.trim())
}

export function isWindowsCodeSigningConfigured(
  env: Map<string, string> = loadCodeSigningEnv(),
): boolean {
  return Boolean(
    env.get('WIN_CSC_LINK')?.trim() ||
      (process.platform === 'win32' && env.get('CSC_LINK')?.trim()),
  )
}

export function isMacNotarizeConfigured(
  env: Map<string, string> = loadCodeSigningEnv(),
): boolean {
  return Boolean(
    env.get('APPLE_ID')?.trim() &&
      env.get('APPLE_APP_SPECIFIC_PASSWORD')?.trim() &&
      env.get('APPLE_TEAM_ID')?.trim(),
  )
}

/** Apply signing env to the current process before invoking electron-builder. */
export function applyCodeSigningEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): Map<string, string> {
  const signingEnv = loadCodeSigningEnv(processEnv)

  for (const [key, value] of signingEnv) {
    if (!value.trim()) continue
    let resolved = value
    if (key === 'CSC_LINK' || key === 'WIN_CSC_LINK') {
      resolved = resolveCertificatePath(value)
    }
    if (key === 'CSC_NAME') {
      resolved = normalizeMacSignIdentity(value)
    }
    processEnv[key] = resolved
  }

  const normalizedName = processEnv.CSC_NAME?.trim()
  if (normalizedName) {
    processEnv.CSC_NAME = normalizedName
    processEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    const link = processEnv.CSC_LINK?.trim()
    // Local .p12 + keychain identity: prefer keychain (bad .p12 breaks signing).
    // CI uses data: base64 CSC_LINK — keep that path.
    if (link && !link.startsWith('data:')) {
      delete processEnv.CSC_LINK
      delete processEnv.CSC_KEY_PASSWORD
    }
  }

  const winLink = processEnv.WIN_CSC_LINK?.trim()
  if (process.platform === 'win32' && winLink) {
    processEnv.CSC_LINK = winLink
    const winPass = processEnv.WIN_CSC_KEY_PASSWORD?.trim()
    if (winPass) processEnv.CSC_KEY_PASSWORD = winPass
  }

  return signingEnv
}

export function buildElectronBuilderExtraArgs(
  env: Map<string, string> = loadCodeSigningEnv(),
  options?: { buildingMac?: boolean; buildingWin?: boolean },
): string[] {
  const args: string[] = []
  if (isMacNotarizeConfigured(env)) {
    args.push('--config.mac.notarize=true')
  }
  // Unsigned macOS builds on recent macOS versions fail at dyld launch when
  // hardenedRuntime is enabled but inner frameworks are not signed consistently.
  if (options?.buildingMac && !isMacCodeSigningConfigured(env)) {
    args.push('--config.mac.hardenedRuntime=false')
  }
  // Unsigned Windows builds must skip Authenticode signing (build.json default is true).
  if (options?.buildingWin && !isWindowsCodeSigningConfigured(env)) {
    args.push('--config.win.signAndEditExecutable=false')
  }
  return args
}

/**
 * Prevent electron-builder from auto-discovering keychain certs when the target
 * platform has no explicit signing credentials — avoids partial/inconsistent signing.
 */
export function applyUnsignedPlatformBuildPolicy(
  processEnv: NodeJS.ProcessEnv,
  signingEnv: Map<string, string>,
  options: { buildingMac?: boolean; buildingWin?: boolean },
): void {
  if (options.buildingMac && !isMacCodeSigningConfigured(signingEnv)) {
    processEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
  if (options.buildingWin && !isWindowsCodeSigningConfigured(signingEnv)) {
    processEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
}
