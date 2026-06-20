import { describe, expect, it } from 'vitest'
import { computeContextWindowUsage } from './context-window-usage'

describe('computeContextWindowUsage', () => {
  it('reports fill ratio and capacity flags', () => {
    expect(computeContextWindowUsage({ messageCount: 12, capacity: 20 })).toEqual({
      used: 12,
      capacity: 20,
      atCapacity: false,
      overCapacity: false,
      fillRatio: 0.6,
    })
    expect(computeContextWindowUsage({ messageCount: 20, capacity: 20 }).atCapacity).toBe(
      true,
    )
    expect(computeContextWindowUsage({ messageCount: 24, capacity: 20 }).overCapacity).toBe(
      true,
    )
  })
})
