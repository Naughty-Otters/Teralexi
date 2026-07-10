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

/** Azure Trusted Signing (Windows) — see docs/CODE-SIGNING-WINDOWS.md. */
export const AZURE_TRUSTED_SIGNING_ENV_KEYS = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_SIGNING_ENDPOINT',
  'AZURE_SIGNING_ACCOUNT_NAME',
  'AZURE_SIGNING_CERTIFICATE_PROFILE',
  'AZURE_SIGNING_PUBLISHER_NAME',
] as const

export type AzureTrustedSigningEnvKey =
  (typeof AZURE_TRUSTED_SIGNING_ENV_KEYS)[number]

export type AzureTrustedSigningOptions = {
  publisherName: string
  endpoint: string
  certificateProfileName: string
  codeSigningAccountName: string
}

export type AzureTrustedSigningFieldStatus = {
  key: AzureTrustedSigningEnvKey
  label: string
  hint: string
  present: boolean
  formatWarning?: string
}

export type AzureTrustedSigningInspection = {
  configured: boolean
  anyPresent: boolean
  fields: AzureTrustedSigningFieldStatus[]
  missingKeys: AzureTrustedSigningEnvKey[]
  formatWarnings: string[]
}

const AZURE_TRUSTED_SIGNING_FIELD_META: Record<
  AzureTrustedSigningEnvKey,
  { label: string; hint: string }
> = {
  AZURE_TENANT_ID: {
    label: 'Entra tenant ID',
    hint: 'Azure Portal → Microsoft Entra ID → Overview → Tenant ID (directory ID, not subscription ID)',
  },
  AZURE_CLIENT_ID: {
    label: 'App Registration client ID',
    hint: 'Azure Portal → App registrations → your app → Overview → Application (client) ID — not Object ID',
  },
  AZURE_CLIENT_SECRET: {
    label: 'App Registration client secret',
    hint: 'App registrations → Certificates & secrets → client secret Value (copy at creation; Secret ID is wrong)',
  },
  AZURE_SIGNING_ENDPOINT: {
    label: 'Artifact Signing endpoint',
    hint: 'Regional URL from certificate profile setup, e.g. https://eus.codesigning.azure.net/ or https://neu.codesigning.azure.net/',
  },
  AZURE_SIGNING_ACCOUNT_NAME: {
    label: 'Artifact Signing account name',
    hint: 'Azure Portal → Artifact Signing account resource name (not the App Registration name)',
  },
  AZURE_SIGNING_CERTIFICATE_PROFILE: {
    label: 'Certificate profile name',
    hint: 'Artifact Signing account → Certificate profiles → profile name',
  },
  AZURE_SIGNING_PUBLISHER_NAME: {
    label: 'Publisher name (certificate CN)',
    hint: 'Exact legal name from completed identity validation (Common Name on the certificate)',
  },
}

function validateAzureTrustedSigningFieldFormat(
  key: AzureTrustedSigningEnvKey,
  value: string,
): string | undefined {
  if (key === 'AZURE_SIGNING_ENDPOINT') {
    if (!/^https:\/\/[a-z0-9-]+\.codesigning\.azure\.net\/?$/i.test(value)) {
      return 'Expected https://<region>.codesigning.azure.net/ (trailing slash optional)'
    }
  }
  if (key === 'AZURE_TENANT_ID' || key === 'AZURE_CLIENT_ID') {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      return 'Expected a GUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    }
  }
  return undefined
}

export function inspectAzureTrustedSigningEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): AzureTrustedSigningInspection {
  const azure = getAzureTrustedSigningEnv(processEnv)
  const fields: AzureTrustedSigningFieldStatus[] = []
  const missingKeys: AzureTrustedSigningEnvKey[] = []
  const formatWarnings: string[] = []

  for (const key of AZURE_TRUSTED_SIGNING_ENV_KEYS) {
    const value = azure[key]?.trim() ?? ''
    const present = Boolean(value)
    const meta = AZURE_TRUSTED_SIGNING_FIELD_META[key]
    const formatWarning = present
      ? validateAzureTrustedSigningFieldFormat(key, value)
      : undefined

    fields.push({
      key,
      label: meta.label,
      hint: meta.hint,
      present,
      formatWarning,
    })
    if (!present) missingKeys.push(key)
    if (formatWarning) {
      formatWarnings.push(`${key}: ${formatWarning}`)
    }
  }

  const anyPresent = fields.some((field) => field.present)
  const configured =
    missingKeys.length === 0 && formatWarnings.length === 0

  return {
    configured,
    anyPresent,
    fields,
    missingKeys,
    formatWarnings,
  }
}

export function formatAzureTrustedSigningValidationBanner(
  report: AzureTrustedSigningInspection,
): string {
  const lines: string[] = []
  const rule = '='.repeat(72)

  if (report.configured) {
    lines.push(rule)
    lines.push('AZURE TRUSTED SIGNING: all required variables are present')
    lines.push(rule)
    for (const field of report.fields) {
      lines.push(`  OK  ${field.key} (${field.label})`)
    }
    lines.push(rule)
    return lines.join('\n')
  }

  lines.push(rule)
  lines.push('AZURE TRUSTED SIGNING: configuration incomplete — signing will NOT use Azure')
  lines.push(rule)
  for (const field of report.fields) {
    const status = field.present ? 'OK ' : 'MISSING'
    lines.push(`  ${status}  ${field.key}`)
    lines.push(`         ${field.label}`)
    lines.push(`         Where: ${field.hint}`)
    if (field.formatWarning) {
      lines.push(`         Format warning: ${field.formatWarning}`)
    }
  }
  if (report.missingKeys.length > 0) {
    lines.push('')
    lines.push(
      `Missing (${report.missingKeys.length}/${AZURE_TRUSTED_SIGNING_ENV_KEYS.length}): ${report.missingKeys.join(', ')}`,
    )
  }
  lines.push('')
  lines.push(
    'Fix: add every AZURE_* variable to env/.signing.env or GitHub Actions secrets',
  )
  lines.push('     (release + mac_signs environments for CI). See docs/CODE-SIGNING-WINDOWS.md')
  lines.push(
    'Fallback: build continues with WIN_SIGN_CERTIFICATE (.pfx) if set, otherwise self-signed/unsigned.',
  )
  lines.push(rule)
  return lines.join('\n')
}

/** Log a prominent Azure validation report before the Windows build continues. */
export function logAzureTrustedSigningValidation(
  processEnv: NodeJS.ProcessEnv = process.env,
  logger: {
    info: (msg: string) => void
    warn: (msg: string) => void
  } = { info: (m) => console.log(m), warn: (m) => console.warn(m) },
): boolean {
  const report = inspectAzureTrustedSigningEnv(processEnv)
  if (!report.anyPresent) return false

  const banner = formatAzureTrustedSigningValidationBanner(report)
  if (report.configured) {
    logger.info(`[code-sign]\n${banner}`)
    return true
  }

  logger.warn(`[code-sign]\n${banner}`)
  return false
}

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
      continue
    }
    if (
      AZURE_TRUSTED_SIGNING_ENV_KEYS.includes(
        rawKey as AzureTrustedSigningEnvKey,
      )
    ) {
      entries.set(rawKey, rawValue)
    }
  }
  return entries
}

function loadAzureTrustedSigningEnvFromFile(
  cwd = process.cwd(),
): Map<string, string> {
  const merged = new Map<string, string>()
  for (const filePath of resolveCodeSigningEnvFilePaths(cwd)) {
    if (!existsSync(filePath)) continue
    const parsed = parseCodeSigningEnvFile(readFileSync(filePath, 'utf-8'))
    for (const key of AZURE_TRUSTED_SIGNING_ENV_KEYS) {
      const value = parsed.get(key)?.trim()
      if (value) merged.set(key, value)
    }
  }
  return merged
}

export function getAzureTrustedSigningEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): Partial<Record<AzureTrustedSigningEnvKey, string>> {
  const fromFile = loadAzureTrustedSigningEnvFromFile()
  const merged: Partial<Record<AzureTrustedSigningEnvKey, string>> = {}
  for (const key of AZURE_TRUSTED_SIGNING_ENV_KEYS) {
    const value = processEnv[key]?.trim() || fromFile.get(key)?.trim()
    if (value) merged[key] = stripEnvValue(value)
  }
  return merged
}

export function isAzureTrustedSigningConfigured(
  processEnv: NodeJS.ProcessEnv = process.env,
): boolean {
  return inspectAzureTrustedSigningEnv(processEnv).configured
}

export function resolveAzureTrustedSigningOptions(
  processEnv: NodeJS.ProcessEnv = process.env,
): AzureTrustedSigningOptions | null {
  if (!isAzureTrustedSigningConfigured(processEnv)) return null
  const azure = getAzureTrustedSigningEnv(processEnv)
  return {
    publisherName: azure.AZURE_SIGNING_PUBLISHER_NAME!.trim(),
    endpoint: azure.AZURE_SIGNING_ENDPOINT!.trim(),
    certificateProfileName: azure.AZURE_SIGNING_CERTIFICATE_PROFILE!.trim(),
    codeSigningAccountName: azure.AZURE_SIGNING_ACCOUNT_NAME!.trim(),
  }
}

export function formatElectronBuilderConfigOverride(
  configPath: string,
  value: string,
): string {
  const needsQuotes = /[\s"]/.test(value)
  const rendered = needsQuotes
    ? `"${value.replace(/"/g, '\\"')}"`
    : value
  return `--config.${configPath}=${rendered}`
}

export function buildAzureTrustedSigningExtraArgs(
  processEnv: NodeJS.ProcessEnv = process.env,
): string[] {
  const options = resolveAzureTrustedSigningOptions(processEnv)
  if (!options) return []
  return [
    formatElectronBuilderConfigOverride(
      'win.azureSignOptions.publisherName',
      options.publisherName,
    ),
    formatElectronBuilderConfigOverride(
      'win.azureSignOptions.endpoint',
      options.endpoint,
    ),
    formatElectronBuilderConfigOverride(
      'win.azureSignOptions.certificateProfileName',
      options.certificateProfileName,
    ),
    formatElectronBuilderConfigOverride(
      'win.azureSignOptions.codeSigningAccountName',
      options.codeSigningAccountName,
    ),
  ]
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

export function isWindowsPfxSigningConfigured(
  env: Map<string, string> = loadCodeSigningEnv(),
): boolean {
  return Boolean(
    env.get('WIN_CSC_LINK')?.trim() ||
      (process.platform === 'win32' && env.get('CSC_LINK')?.trim()),
  )
}

export function isWindowsCodeSigningConfigured(
  env: Map<string, string> = loadCodeSigningEnv(),
  processEnv: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isWindowsPfxSigningConfigured(env) ||
    isAzureTrustedSigningConfigured(processEnv)
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
  const link = processEnv.CSC_LINK?.trim()
  const inlineCert = link ? isInlineCertificate(link) : false
  if (normalizedName) {
    processEnv.CSC_NAME = normalizedName
    // Local .p12 *path* + keychain identity: prefer keychain (a bad/mismatched
    // .p12 breaks signing). But keep inline certs — CI passes an identity plus
    // base64 (raw or data:) via MAC_SIGN_CERTIFICATE_BASE64, and dropping it
    // would leave the runner with no cert to sign with.
    if (link && !inlineCert) {
      delete processEnv.CSC_LINK
      delete processEnv.CSC_KEY_PASSWORD
    }
  }

  // Only disable identity auto-discovery when relying on a Keychain identity
  // (no inline cert to import). With an inline cert — CI's base64 .p12 imported
  // into a dedicated temp keychain — keep auto-discovery ON so electron-builder
  // can still resolve the Developer ID identity from the imported cert even if
  // CSC_NAME is absent or doesn't exactly match. Disabling it here caused CI to
  // silently fall back to an ad-hoc signature (no Developer ID, no timestamp).
  if (normalizedName && !inlineCert) {
    processEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  } else if (inlineCert) {
    delete processEnv.CSC_IDENTITY_AUTO_DISCOVERY
  }

  const winLink = processEnv.WIN_CSC_LINK?.trim()
  if (process.platform === 'win32' && winLink) {
    processEnv.CSC_LINK = winLink
    const winPass = processEnv.WIN_CSC_KEY_PASSWORD?.trim()
    if (winPass) processEnv.CSC_KEY_PASSWORD = winPass
  }

  const azureFromFile = loadAzureTrustedSigningEnvFromFile()
  for (const key of AZURE_TRUSTED_SIGNING_ENV_KEYS) {
    if (processEnv[key]?.trim()) continue
    const value = azureFromFile.get(key)?.trim()
    if (value) processEnv[key] = stripEnvValue(value)
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

const AZURE_SIGNING_VARS: { alias: AzureTrustedSigningEnvKey }[] =
  AZURE_TRUSTED_SIGNING_ENV_KEYS.map((alias) => ({ alias }))

/**
 * Inspect the resolved signing env and produce human-readable diagnostics that
 * report which required variables are present/missing per target platform.
 * Values are never printed — only presence. Missing required vars are `warn`.
 */
export function describeCodeSigningEnv(
  env: Map<string, string> = loadCodeSigningEnv(),
  options: { buildingMac?: boolean; buildingWin?: boolean } = {},
  processEnv: NodeJS.ProcessEnv = process.env,
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
    out.push({ level: 'info', message: 'Windows Authenticode (.pfx) variables:' })
    for (const spec of WIN_SIGNING_VARS) out.push(line(spec))

    out.push({ level: 'info', message: 'Azure Trusted Signing variables:' })
    const azure = getAzureTrustedSigningEnv(processEnv)
    for (const spec of AZURE_SIGNING_VARS) {
      out.push({
        level: 'info',
        message: `  ${spec.alias}: ${azure[spec.alias]?.trim() ? 'present' : 'MISSING'}`,
      })
    }

    if (!isWindowsCodeSigningConfigured(env, processEnv)) {
      out.push({
        level: 'warn',
        message:
          'Windows signing NOT configured (set WIN_SIGN_CERTIFICATE or Azure Trusted Signing env vars); build will use a self-signed certificate or be unsigned.',
      })
    } else if (
      isAzureTrustedSigningConfigured(processEnv) &&
      isWindowsPfxSigningConfigured(env)
    ) {
      out.push({
        level: 'warn',
        message:
          'Both Azure Trusted Signing and WIN_SIGN_CERTIFICATE are configured; Azure Trusted Signing will be used.',
      })
    } else if (has('WIN_CSC_LINK') && !has('WIN_CSC_KEY_PASSWORD')) {
      out.push({
        level: 'warn',
        message:
          'WIN_SIGN_CERTIFICATE provided but WIN_SIGN_CERTIFICATE_PASSWORD is MISSING; signing may fail.',
      })
    } else if (
      !isAzureTrustedSigningConfigured(processEnv) &&
      AZURE_SIGNING_VARS.some((spec) => azure[spec.alias]?.trim())
    ) {
      const missing = AZURE_SIGNING_VARS.filter(
        (spec) => !azure[spec.alias]?.trim(),
      ).map((spec) => spec.alias)
      out.push({
        level: 'warn',
        message: `Azure Trusted Signing PARTIALLY configured; missing: ${missing.join(', ')}. Falling back to .pfx or unsigned.`,
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
  processEnv: NodeJS.ProcessEnv = process.env,
): CodeSigningDiagnostic[] {
  const diagnostics = describeCodeSigningEnv(env, options, processEnv)
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
  processEnv: NodeJS.ProcessEnv = process.env,
): string[] {
  const args: string[] = []
  if (isMacNotarizeConfigured(env)) {
    // Notarization runs in scripts/electron-after-sign.cjs with extended staple
    // retries — electron-builder's built-in stapler only retries 3x and often
    // fails with code 68 when api.apple-cloudkit.com times out.
    args.push('--config.mac.notarize=false')
  }
  if (options?.buildingMac && isMacCodeSigningConfigured(env)) {
    // Fail the build if the Developer ID identity can't be resolved instead of
    // silently producing an ad-hoc signature (which then fails notarization with
    // "not signed with a valid Developer ID certificate" / "no secure timestamp").
    args.push('--config.mac.forceCodeSigning=true')
  }
  // Unsigned macOS builds on recent macOS versions fail at dyld launch when
  // hardenedRuntime is enabled but inner frameworks are not signed consistently.
  if (options?.buildingMac && !isMacCodeSigningConfigured(env)) {
    args.push('--config.mac.hardenedRuntime=false')
  }
  if (options?.buildingWin && isAzureTrustedSigningConfigured(processEnv)) {
    args.push(...buildAzureTrustedSigningExtraArgs(processEnv))
  }
  // Unsigned Windows builds must skip Authenticode signing (build.json default is true).
  if (options?.buildingWin && !isWindowsCodeSigningConfigured(env, processEnv)) {
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
  if (options.buildingWin && !isWindowsCodeSigningConfigured(signingEnv, processEnv)) {
    processEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
}
