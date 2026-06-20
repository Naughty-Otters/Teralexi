import { describe, expect, it, vi } from 'vitest'
import { getChannelRegistry } from './channel-registry'

describe('channel-registry', () => {
  it('registers and retrieves senders', () => {
    const registry = getChannelRegistry()
    const sender = { sendToTarget: vi.fn(async () => undefined) }
    registry.register('whatsapp', sender)
    expect(registry.get('whatsapp')).toBe(sender)
    expect(registry.get('missing')).toBeNull()
  })
})
