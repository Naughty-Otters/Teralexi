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

export function resolveBuildEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): OpenFdeBuildEnv {
  const fromEnv = processEnv[OPENFDE_BUILD_ENV_VAR]
  if (fromEnv?.trim()) {
    return normalizeBuildEnv(fromEnv)
  }
  return normalizeBuildEnv(processEnv.NODE_ENV)
}

export function resolveRuntimeNodeEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): string {
  const buildEnv = processEnv[OPENFDE_BUILD_ENV_VAR]?.trim()
  if (buildEnv) {
    return buildEnvToNodeEnv(normalizeBuildEnv(buildEnv))
  }
  return processEnv.NODE_ENV?.trim() || 'development'
}
