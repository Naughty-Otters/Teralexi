import { describe, expect, it } from 'vitest'
import { expectedIssuerFor } from './entitlement-issuer'

describe('expectedIssuerFor', () => {
  it('matches normalized API base URLs per environment', () => {
    expect(expectedIssuerFor('http://localhost:8000/')).toBe(
      'http://localhost:8000',
    )
    expect(expectedIssuerFor('https://staging.teralexi.com/')).toBe(
      'https://staging.teralexi.com',
    )
    expect(expectedIssuerFor('https://api.teralexi.com')).toBe(
      'https://api.teralexi.com',
    )
  })

  it('throws when API base is empty', () => {
    expect(() => expectedIssuerFor('')).toThrow(/not configured/)
  })
})
