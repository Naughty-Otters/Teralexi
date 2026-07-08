import { beforeEach, describe, expect, it } from 'vitest'
import { getTeralexiProtocolBridge } from './teralexi-protocol-bridge'

describe('teralexi-protocol-bridge', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__teralexiProtocolBridge
  })

  it('returns the same bridge object from globalThis', () => {
    const a = getTeralexiProtocolBridge()
    const b = getTeralexiProtocolBridge()
    expect(a).toBe(b)
    a.pendingUrls.push('teralexi://open?token=x')
    expect(b.pendingUrls).toEqual(['teralexi://open?token=x'])
  })
})
