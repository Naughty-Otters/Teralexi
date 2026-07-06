export type TeralexiBuildEnv = 'dev' | 'sit' | 'prod'

export const TERALEXI_BUILD_ENV_VAR = 'TERALEXI_BUILD_ENV'

/** Replaced at desktop bundle time via rollup/vite `define` (see `.electron-vite/rollup.config.ts`). */
export const BAKED_TERALEXI_BUILD_ENV = '__TERALEXI_BUILD_ENV__'

export function normalizeBuildEnv(raw: unknown): TeralexiBuildEnv {
  const mode = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (mode === 'prod' || mode === 'production') return 'prod'
  if (mode === 'sit' || mode === 'staging' || mode === 'stage') return 'sit'
  return 'dev'
}

export function buildEnvToNodeEnv(mode: TeralexiBuildEnv): string {
  switch (mode) {
    case 'prod':
      return 'production'
    case 'sit':
      return 'sit'
    default:
      return 'development'
  }
}

export function buildEnvToEnvFileName(mode: TeralexiBuildEnv): string {
  return `.${mode}.env`
}

import { isUnresolvedBakedPlaceholder } from './baked-app-env'

/** Inlined at desktop build time; falls back to process env for dev/tests. */
function readBakedBuildEnv(): string {
  const baked = BAKED_TERALEXI_BUILD_ENV
  if (baked && !isUnresolvedBakedPlaceholder(baked)) {
    return baked
  }
  return process.env.TERALEXI_BUILD_ENV ?? ''
}

export function resolveBuildEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): TeralexiBuildEnv {
  const fromEnv = processEnv[TERALEXI_BUILD_ENV_VAR]
  if (fromEnv?.trim()) {
    return normalizeBuildEnv(fromEnv)
  }
  const baked = readBakedBuildEnv()
  if (baked.trim()) {
    return normalizeBuildEnv(baked)
  }
  return normalizeBuildEnv(processEnv.NODE_ENV)
}

export function resolveRuntimeNodeEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): string {
  return buildEnvToNodeEnv(resolveBuildEnv(processEnv))
}
