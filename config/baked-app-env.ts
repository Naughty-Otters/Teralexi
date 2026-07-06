/** Replaced in main bundle by rollup (see `.electron-vite/rollup.config.ts`). */
export const BAKED_BASE_API = '__TERALEXI_BASE_API__'

/** Replaced in main bundle by rollup. */
export const BAKED_DESKTOP_UPDATE_FORCE_DEV = '__TERALEXI_DESKTOP_UPDATE_FORCE_DEV__'

/** Rollup replace touches every `__TERALEXI_*__` literal — detect unresolved placeholders by shape. */
export function isUnresolvedBakedPlaceholder(value: string): boolean {
  return /^__TERALEXI_[A-Z0-9_]+__$/.test(value)
}

function stripEnvValue(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function readBakedBaseApi(
  processEnv: NodeJS.ProcessEnv = process.env,
): string {
  const baked = BAKED_BASE_API
  if (baked && !isUnresolvedBakedPlaceholder(baked)) {
    return stripEnvValue(baked)
  }
  const fromEnv = processEnv.BASE_API?.trim()
  return fromEnv ? stripEnvValue(fromEnv) : ''
}

export function readBakedDesktopUpdateForceDev(
  processEnv: NodeJS.ProcessEnv = process.env,
): string {
  const baked = BAKED_DESKTOP_UPDATE_FORCE_DEV
  if (baked && !isUnresolvedBakedPlaceholder(baked)) {
    return stripEnvValue(baked)
  }
  const fromEnv = processEnv.DESKTOP_UPDATE_FORCE_DEV?.trim()
  return fromEnv ? stripEnvValue(fromEnv) : ''
}

/** Env-only values inlined at build time for packaged apps. */
export function loadBakedEnvOverrides(
  knownKeys: readonly string[],
  processEnv: NodeJS.ProcessEnv = process.env,
): Map<string, string> {
  const merged = new Map<string, string>()
  const baseApi = readBakedBaseApi(processEnv)
  if (baseApi && knownKeys.includes('app.base.apiUrl')) {
    merged.set('app.base.apiUrl', baseApi)
  }
  const forceDev = readBakedDesktopUpdateForceDev(processEnv)
  if (forceDev && knownKeys.includes('app.desktop.forceDevUpdateConfig')) {
    merged.set('app.desktop.forceDevUpdateConfig', forceDev)
  }
  return merged
}
