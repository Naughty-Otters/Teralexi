import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBakedEnvOverrides } from './baked-app-env'
import {
  buildEnvToEnvFileName,
  resolveBuildEnv,
} from './build-env'
import { isValidSystemPropKey } from './system-prop-keys'

const TERALEXI_ENV_PREFIX = 'TERALEXI_'

let cachedEnvOverrides: Map<string, string> | null = null
let envOverridesInitialized = false

export function isPackagedRuntime(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    return app?.isPackaged === true
  } catch {
    return false
  }
}

export function systemPropKeyToEnvName(key: string): string {
  return key.replace(/\./g, '_').toUpperCase()
}

export function envNameToSystemPropKey(
  envName: string,
  knownKeys: readonly string[],
): string | null {
  let normalized = envName.trim()
  if (!normalized) return null
  if (isValidSystemPropKey(normalized)) return normalized

  if (normalized.toUpperCase().startsWith(TERALEXI_ENV_PREFIX)) {
    normalized = normalized.slice(TERALEXI_ENV_PREFIX.length)
  }

  const upper = normalized.toUpperCase()
  for (const key of knownKeys) {
    if (systemPropKeyToEnvName(key) === upper) return key
  }

  const dotted = normalized.toLowerCase().replace(/_/g, '.')
  return isValidSystemPropKey(dotted) ? dotted : null
}

export function stripEnvValue(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseEnvFile(
  content: string,
  knownKeys: readonly string[],
): Map<string, string> {
  const entries = new Map<string, string>()
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) continue

    const rawKey = line.slice(0, eqIndex).trim()
    const rawValue = line.slice(eqIndex + 1).trim()
    if (rawKey === 'BASE_API') {
      entries.set('app.base.apiUrl', stripEnvValue(rawValue))
      continue
    }
    if (rawKey === 'ENTITLEMENT_SIGNING_PUBLIC_KEY_PEM') {
      entries.set('app.entitlement.signingPublicKeyPem', stripEnvValue(rawValue))
      continue
    }
    if (rawKey === 'DESKTOP_UPDATE_FORCE_DEV') {
      entries.set('app.desktop.forceDevUpdateConfig', stripEnvValue(rawValue))
      continue
    }
    const key = envNameToSystemPropKey(rawKey, knownKeys)
    if (!key) continue

    entries.set(key, stripEnvValue(rawValue))
  }
  return entries
}

/** Build-time env file for the active mode (`env/.dev.env`, `.sit.env`, or `.prod.env`). */
export function resolveBuildTimeEnvFilePaths(
  cwd = process.cwd(),
  processEnv: NodeJS.ProcessEnv = process.env,
): string[] {
  const mode = resolveBuildEnv(processEnv)
  return [join(cwd, 'env', buildEnvToEnvFileName(mode))]
}

/** @deprecated Use {@link resolveBuildTimeEnvFilePaths}. */
export function resolveEnvSearchRoots(args?: {
  moduleDir?: string
  appPath?: string | null
  cwd?: string
}): string[] {
  const cwd = args?.cwd ?? process.cwd()
  return cwd.trim() ? [cwd.trim()] : []
}

/** @deprecated Use {@link resolveBuildTimeEnvFilePaths}. */
export function resolveEnvFilePaths(
  searchRoots: readonly string[],
  processEnv: NodeJS.ProcessEnv = process.env,
): string[] {
  const cwd = searchRoots.find((root) => root?.trim()) ?? process.cwd()
  return resolveBuildTimeEnvFilePaths(cwd, processEnv)
}

export function loadEnvOverrides(args: {
  knownKeys: readonly string[]
  searchRoots?: readonly string[]
  processEnv?: NodeJS.ProcessEnv
}): Map<string, string> {
  const env = args.processEnv ?? process.env

  if (isPackagedRuntime()) {
    return loadBakedEnvOverrides(args.knownKeys, env)
  }

  const merged = new Map<string, string>()
  const cwd =
    args.searchRoots?.find((root) => root?.trim())?.trim() ?? process.cwd()

  for (const filePath of resolveBuildTimeEnvFilePaths(cwd, env)) {
    if (!existsSync(filePath)) continue
    const parsed = parseEnvFile(readFileSync(filePath, 'utf-8'), args.knownKeys)
    for (const [key, value] of parsed) {
      merged.set(key, value)
    }
  }

  for (const key of args.knownKeys) {
    for (const envName of [
      systemPropKeyToEnvName(key),
      `${TERALEXI_ENV_PREFIX}${systemPropKeyToEnvName(key)}`,
      key,
    ]) {
      const value = env[envName]
      if (value == null) continue
      merged.set(key, stripEnvValue(String(value)))
      break
    }
  }

  const baseApi = env.BASE_API?.trim()
  if (baseApi) {
    merged.set('app.base.apiUrl', stripEnvValue(baseApi))
  }

  const entitlementPem = env.ENTITLEMENT_SIGNING_PUBLIC_KEY_PEM?.trim()
  if (entitlementPem) {
    merged.set(
      'app.entitlement.signingPublicKeyPem',
      stripEnvValue(entitlementPem),
    )
  }

  const forceDevUpdate = env.DESKTOP_UPDATE_FORCE_DEV?.trim()
  if (forceDevUpdate) {
    merged.set(
      'app.desktop.forceDevUpdateConfig',
      stripEnvValue(String(forceDevUpdate)),
    )
  }

  return merged
}

export function initializeEnvOverrides(knownKeys: readonly string[]): void {
  if (envOverridesInitialized) return
  envOverridesInitialized = true

  cachedEnvOverrides = loadEnvOverrides({
    knownKeys,
    searchRoots: isPackagedRuntime() ? [] : [process.cwd()],
  })
}

export function getEnvOverrides(): Map<string, string> {
  return cachedEnvOverrides ?? new Map()
}

export function resetEnvOverridesForTests(): void {
  cachedEnvOverrides = null
  envOverridesInitialized = false
}
