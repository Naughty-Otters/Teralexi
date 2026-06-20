import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClawHubClient, resetClawHubClientForTests } from './clawhub-client'

describe('ClawHubClient', () => {
  beforeEach(() => {
    resetClawHubClientForTests()
  })

  it('searches skills via API', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        results: [{ slug: 'demo', displayName: 'Demo', summary: '', version: '1.0.0', updatedAt: 1 }],
      }),
    })) as unknown as typeof fetch

    const client = new ClawHubClient({ baseUrl: 'https://clawhub.test', fetchImpl })
    const result = await client.searchSkills({ query: 'demo' })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://clawhub.test/api/v1/search?q=demo&nonSuspiciousOnly=true',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.slug).toBe('demo')
  })

  it('maps skill detail response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        skill: { slug: 'demo', displayName: 'Demo', summary: 'Summary' },
        latestVersion: { version: '1.2.0', createdAt: 123 },
      }),
    })) as unknown as typeof fetch

    const client = new ClawHubClient({ baseUrl: 'https://clawhub.test', fetchImpl })
    const detail = await client.getSkill('demo')

    expect(detail.slug).toBe('demo')
    expect(detail.latestVersion.version).toBe('1.2.0')
  })

  it('retries on 429 with retry-after', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '0' }),
          text: async () => 'rate limited',
        }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ results: [] }),
      }
    }) as unknown as typeof fetch

    const client = new ClawHubClient({ baseUrl: 'https://clawhub.test', fetchImpl })
    const result = await client.searchSkills({ query: 'x' })
    expect(calls).toBe(2)
    expect(result.results).toEqual([])
  })
})
