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

/**
 * True when a CSC_LINK value is an inline certificate (base64 content or a
 * `data:` URL) rather than a local file path. Mirrors electron-builder's own
 * detection in `codeSign/codesign.ts`: a `data:` URL, or bare base64 that is
 * long (> 2048 chars, e.g. a `.p12`) or padded (ends with `=`).
 *
 * Inline certs must be kept when a signing identity is also set (CI passes both
 * MAC_SIGN_IDENTITY and MAC_SIGN_CERTIFICATE_BASE64); only a local .p12 *path*
 * should defer to the Keychain identity.
 */
export function isInlineCertificate(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:')) return true
  if (trimmed.length > 2048) return true
  if (trimmed.endsWith('=')) return true
  return false
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
    // Local .p12 *path* + keychain identity: prefer keychain (a bad/mismatched
    // .p12 breaks signing). But keep inline certs — CI passes an identity plus
    // base64 (raw or data:) via MAC_SIGN_CERTIFICATE_BASE64, and dropping it
    // would leave the runner with no cert to sign with.
    if (link && !isInlineCertificate(link)) {
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

/** A single line of signing-env diagnostics. */
export interface CodeSigningDiagnostic {
  level: 'info' | 'warn'
  message: string
}

interface SigningVarSpec {
  alias: string
  key: ElectronBuilderSigningKey
}

const MAC_SIGNING_VARS: SigningVarSpec[] = [
  { alias: 'MAC_SIGN_IDENTITY', key: 'CSC_NAME' },
  { alias: 'MAC_SIGN_CERTIFICATE', key: 'CSC_LINK' },
  { alias: 'MAC_SIGN_CERTIFICATE_PASSWORD', key: 'CSC_KEY_PASSWORD' },
]

const MAC_NOTARIZE_VARS: SigningVarSpec[] = [
  { alias: 'MAC_APPLE_ID', key: 'APPLE_ID' },
  { alias: 'MAC_APPLE_APP_SPECIFIC_PASSWORD', key: 'APPLE_APP_SPECIFIC_PASSWORD' },
  { alias: 'MAC_APPLE_TEAM_ID', key: 'APPLE_TEAM_ID' },
]

const WIN_SIGNING_VARS: SigningVarSpec[] = [
  { alias: 'WIN_SIGN_CERTIFICATE', key: 'WIN_CSC_LINK' },
  { alias: 'WIN_SIGN_CERTIFICATE_PASSWORD', key: 'WIN_CSC_KEY_PASSWORD' },
]

/**
 * Inspect the resolved signing env and produce human-readable diagnostics that
 * report which required variables are present/missing per target platform.
 * Values are never printed — only presence. Missing required vars are `warn`.
 */
export function describeCodeSigningEnv(
  env: Map<string, string> = loadCodeSigningEnv(),
  options: { buildingMac?: boolean; buildingWin?: boolean } = {},
): CodeSigningDiagnostic[] {
  const out: CodeSigningDiagnostic[] = []
  const has = (key: string): boolean => Boolean(env.get(key)?.trim())
  // Per-variable presence lines are informational (macOS identity vs .p12 are
  // alternatives). Actual requirement failures are reported as `warn` below.
  const line = (spec: SigningVarSpec): CodeSigningDiagnostic => ({
    level: 'info',
    message: `  ${spec.alias} (${spec.key}): ${has(spec.key) ? 'present' : 'MISSING'}`,
  })

  if (options.buildingMac) {
    out.push({ level: 'info', message: 'macOS signing variables:' })
    for (const spec of MAC_SIGNING_VARS) out.push(line(spec))

    if (!isMacCodeSigningConfigured(env)) {
      out.push({
        level: 'warn',
        message:
          'macOS signing NOT configured (set MAC_SIGN_IDENTITY or MAC_SIGN_CERTIFICATE). App will be ad-hoc signed and CANNOT be notarized.',
      })
    } else if (
      has('CSC_LINK') &&
      !has('CSC_KEY_PASSWORD') &&
      !env.get('CSC_LINK')!.trim().startsWith('data:')
    ) {
      out.push({
        level: 'warn',
        message:
          'MAC_SIGN_CERTIFICATE (.p12) provided but MAC_SIGN_CERTIFICATE_PASSWORD is MISSING; signing may fail.',
      })
    }

    out.push({ level: 'info', message: 'Apple notarization variables:' })
    for (const spec of MAC_NOTARIZE_VARS) out.push(line(spec))

    const presentNotarize = MAC_NOTARIZE_VARS.filter((v) => has(v.key))
    if (presentNotarize.length === 0) {
      out.push({
        level: 'warn',
        message:
          'Notarization DISABLED (no Apple credentials). Distributed macOS app may be blocked by Gatekeeper.',
      })
    } else if (presentNotarize.length < MAC_NOTARIZE_VARS.length) {
      const missing = MAC_NOTARIZE_VARS.filter((v) => !has(v.key)).map(
        (v) => v.alias,
      )
      out.push({
        level: 'warn',
        message: `Notarization PARTIALLY configured; missing: ${missing.join(', ')}. Notarization will be skipped.`,
      })
    } else if (!isMacCodeSigningConfigured(env)) {
      out.push({
        level: 'warn',
        message:
          'Apple notarization credentials present but no signing identity — notarization requires a Developer ID signature.',
      })
    }
  }

  if (options.buildingWin) {
    out.push({ level: 'info', message: 'Windows signing variables:' })
    for (const spec of WIN_SIGNING_VARS) out.push(line(spec))

    if (!isWindowsCodeSigningConfigured(env)) {
      out.push({
        level: 'warn',
        message:
          'Windows signing NOT configured (set WIN_SIGN_CERTIFICATE); build will use a self-signed certificate or be unsigned.',
      })
    } else if (has('WIN_CSC_LINK') && !has('WIN_CSC_KEY_PASSWORD')) {
      out.push({
        level: 'warn',
        message:
          'WIN_SIGN_CERTIFICATE provided but WIN_SIGN_CERTIFICATE_PASSWORD is MISSING; signing may fail.',
      })
    }
  }

  return out
}

/** Emit signing diagnostics through the given logger (defaults to console). */
export function logCodeSigningEnv(
  env: Map<string, string> = loadCodeSigningEnv(),
  options: { buildingMac?: boolean; buildingWin?: boolean } = {},
  logger: {
    info: (msg: string) => void
    warn: (msg: string) => void
  } = { info: (m) => console.log(m), warn: (m) => console.warn(m) },
): CodeSigningDiagnostic[] {
  const diagnostics = describeCodeSigningEnv(env, options)
  for (const d of diagnostics) {
    const message = `[code-sign] ${d.message}`
    if (d.level === 'warn') logger.warn(message)
    else logger.info(message)
  }
  return diagnostics
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
