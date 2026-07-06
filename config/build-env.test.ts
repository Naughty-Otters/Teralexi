import { describe, expect, it } from 'vitest'
import {
  buildEnvToEnvFileName,
  buildEnvToNodeEnv,
  normalizeBuildEnv,
  resolveBuildEnv,
  resolveRuntimeNodeEnv,
} from './build-env'

describe('build-env', () => {
  it('normalizes build env aliases', () => {
    expect(normalizeBuildEnv('prod')).toBe('prod')
    expect(normalizeBuildEnv('production')).toBe('prod')
    expect(normalizeBuildEnv('sit')).toBe('sit')
    expect(normalizeBuildEnv('staging')).toBe('sit')
    expect(normalizeBuildEnv('dev')).toBe('dev')
    expect(normalizeBuildEnv(undefined)).toBe('dev')
  })

  it('maps build env to node env and env file names', () => {
    expect(buildEnvToNodeEnv('dev')).toBe('development')
    expect(buildEnvToNodeEnv('sit')).toBe('sit')
    expect(buildEnvToNodeEnv('prod')).toBe('production')
    expect(buildEnvToEnvFileName('sit')).toBe('.sit.env')
  })

  it('prefers TERALEXI_BUILD_ENV over NODE_ENV', () => {
    expect(
      resolveBuildEnv({
        TERALEXI_BUILD_ENV: 'sit',
        NODE_ENV: 'production',
      }),
    ).toBe('sit')
    expect(
      resolveRuntimeNodeEnv({
        TERALEXI_BUILD_ENV: 'prod',
        NODE_ENV: 'development',
      }),
    ).toBe('production')
  })

  it('defaults runtime node env to development when no build env is set', () => {
    expect(resolveRuntimeNodeEnv({})).toBe('development')
  })
})
