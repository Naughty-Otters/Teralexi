import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('subAgentWorktreeState', () => {
  beforeEach(() => {
    vi.resetModules()
    const store: Record<string, string> = {}
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key]
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      key: () => null,
      length: 0,
    })
  })

  it('persists resolved run ids across remounts', async () => {
    const mod = await import('./subAgentWorktreeState')
    expect(mod.isSubAgentWorktreeResolved('run-1')).toBe(false)
    mod.markSubAgentWorktreeResolved('run-1')
    expect(mod.isSubAgentWorktreeResolved('run-1')).toBe(true)

    vi.resetModules()
    const remounted = await import('./subAgentWorktreeState')
    expect(remounted.isSubAgentWorktreeResolved('run-1')).toBe(true)
  })
})
