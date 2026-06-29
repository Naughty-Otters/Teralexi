export type OpenFdeBuildEnv = 'dev' | 'sit' | 'prod'

export const OPENFDE_BUILD_ENV_VAR = 'OPENFDE_BUILD_ENV'

export function normalizeBuildEnv(raw: unknown): OpenFdeBuildEnv {
  const mode = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (mode === 'prod' || mode === 'production') return 'prod'
  if (mode === 'sit' || mode === 'staging' || mode === 'stage') return 'sit'
  return 'dev'
}

export function buildEnvToNodeEnv(mode: OpenFdeBuildEnv): string {
  switch (mode) {
    case 'prod':
      return 'production'
    case 'sit':
      return 'sit'
    default:
      return 'development'
  }
}

export function buildEnvToEnvFileName(mode: OpenFdeBuildEnv): string {
  return `.${mode}.env`
}

/** Inlined at desktop build time via rollup `@rollup/plugin-replace`. */
function readBakedBuildEnv(): string {
  return process.env.OPENFDE_BUILD_ENV ?? ''
}

export function resolveBuildEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): OpenFdeBuildEnv {
  const fromEnv = processEnv[OPENFDE_BUILD_ENV_VAR]
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
