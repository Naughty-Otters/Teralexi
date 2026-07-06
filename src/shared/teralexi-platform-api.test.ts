import { describe, expect, it } from 'vitest'
import {
  joinTeralexiPlatformUrl,
  normalizeTeralexiBaseApiUrl,
  resolveTeralexiPlatformEndpoint,
  resolveMetricsApiBaseUrl,
} from './teralexi-platform-api'

describe('teralexi-platform-api', () => {
  it('normalizes base API trailing slashes', () => {
    expect(normalizeTeralexiBaseApiUrl('http://127.0.0.1:8000/')).toBe(
      'http://127.0.0.1:8000',
    )
  })

  it('joins relative platform paths to BASE_API', () => {
    expect(
      joinTeralexiPlatformUrl('http://127.0.0.1:8000', 'support/upload'),
    ).toBe('http://127.0.0.1:8000/support/upload')
  })

  it('resolves default relative endpoints from BASE_API', () => {
    expect(
      resolveTeralexiPlatformEndpoint({
        baseApi: 'http://127.0.0.1:8000',
        configured: '',
        defaultPath: 'graphql',
      }),
    ).toBe('http://127.0.0.1:8000/graphql')
  })

  it('supports relative overrides under BASE_API', () => {
    expect(
      resolveTeralexiPlatformEndpoint({
        baseApi: 'http://127.0.0.1:8000',
        configured: 'custom/graphql',
        defaultPath: 'graphql',
      }),
    ).toBe('http://127.0.0.1:8000/custom/graphql')
  })

  it('keeps legacy absolute override URLs', () => {
    expect(
      resolveTeralexiPlatformEndpoint({
        baseApi: 'http://127.0.0.1:8000',
        configured: 'https://metrics.example/graphql',
        defaultPath: 'graphql',
      }),
    ).toBe('https://metrics.example/graphql')
  })

  it('resolveMetricsApiBaseUrl derives origin from absolute GraphQL URL', () => {
    expect(resolveMetricsApiBaseUrl('http://127.0.0.1:8000/graphql')).toBe(
      'http://127.0.0.1:8000',
    )
  })
})
