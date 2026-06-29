import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveRuntimeNodeEnv } from './build-env'
import { isValidSystemPropKey } from './system-prop-keys'

const USER_CONFIG_ENV_FILE = join(homedir(), '.openfde', 'config', '.env')

const OPENFDE_ENV_PREFIX = 'OPENFDE_'

let cachedEnvOverrides: Map<string, string> | null = null
let envOverridesInitialized = false

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

  if (normalized.toUpperCase().startsWith(OPENFDE_ENV_PREFIX)) {
    normalized = normalized.slice(OPENFDE_ENV_PREFIX.length)
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
    const key = envNameToSystemPropKey(rawKey, knownKeys)
    if (!key) continue

    entries.set(key, stripEnvValue(rawValue))
  }
  return entries
}

export function resolveEnvFilePaths(
  searchRoots: readonly string[],
  processEnv: NodeJS.ProcessEnv = process.env,
): string[] {
  const nodeEnv = resolveRuntimeNodeEnv(processEnv)
  const envFileNames = new Set<string>(['.env', `.${nodeEnv}.env`])
  if (nodeEnv === 'production') envFileNames.add('.prod.env')
  if (nodeEnv === 'development') envFileNames.add('.dev.env')
  if (nodeEnv === 'sit') envFileNames.add('.sit.env')

  const paths: string[] = [USER_CONFIG_ENV_FILE]

  for (const root of searchRoots) {
    if (!root?.trim()) continue
    for (const fileName of envFileNames) {
      paths.push(join(root, 'env', fileName))
    }
  }

  return [...new Set(paths)]
}

export function loadEnvOverrides(args: {
  knownKeys: readonly string[]
  searchRoots: readonly string[]
  processEnv?: NodeJS.ProcessEnv
}): Map<string, string> {
  const merged = new Map<string, string>()
  const env = args.processEnv ?? process.env

  for (const filePath of resolveEnvFilePaths(args.searchRoots, env)) {
    if (!existsSync(filePath)) continue
    const parsed = parseEnvFile(readFileSync(filePath, 'utf-8'), args.knownKeys)
    for (const [key, value] of parsed) {
      merged.set(key, value)
    }
  }

  for (const key of args.knownKeys) {
    for (const envName of [
      systemPropKeyToEnvName(key),
      `${OPENFDE_ENV_PREFIX}${systemPropKeyToEnvName(key)}`,
      key,
    ]) {
      const value = env[envName]
      if (value == null) continue
      merged.set(key, stripEnvValue(String(value)))
      break
    }
  }

  return merged
}

export function initializeEnvOverrides(knownKeys: readonly string[]): void {
  if (envOverridesInitialized) return
  envOverridesInitialized = true

  const bundledRoot = join(__dirname, '..')
  cachedEnvOverrides = loadEnvOverrides({
    knownKeys,
    searchRoots: [bundledRoot, process.cwd()],
  })
}

export function getEnvOverrides(): Map<string, string> {
  return cachedEnvOverrides ?? new Map()
}

export function resetEnvOverridesForTests(): void {
  cachedEnvOverrides = null
  envOverridesInitialized = false
}
