import { describe, expect, it } from 'vitest'
import {
  isUnresolvedBakedPlaceholder,
  loadBakedEnvOverrides,
  readBakedBaseApi,
} from './baked-app-env'

describe('baked-app-env', () => {
  it('detects unresolved rollup placeholders', () => {
    expect(isUnresolvedBakedPlaceholder('__TERALEXI_BASE_API__')).toBe(true)
    expect(isUnresolvedBakedPlaceholder('https://staging.teralexi.com/')).toBe(
      false,
    )
  })

  it('readBakedBaseApi falls back to process env when placeholder is unresolved', () => {
    expect(
      readBakedBaseApi({ BASE_API: 'https://staging.example.com/' } as NodeJS.ProcessEnv),
    ).toBe('https://staging.example.com/')
  })

  it('loadBakedEnvOverrides maps BASE_API to app.base.apiUrl', () => {
    const overrides = loadBakedEnvOverrides(['app.base.apiUrl'], {
      BASE_API: 'https://staging.example.com/',
    } as NodeJS.ProcessEnv)
    expect(overrides.get('app.base.apiUrl')).toBe('https://staging.example.com/')
  })
})
