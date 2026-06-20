export type ContextWindowUsage = {
  used: number
  capacity: number
  atCapacity: boolean
  overCapacity: boolean
  /** 0–1 fill ratio for UI meters (clamped). */
  fillRatio: number
}

export function computeContextWindowUsage(args: {
  messageCount: number
  capacity: number
}): ContextWindowUsage {
  const capacity = Math.max(1, Math.round(args.capacity))
  const used = Math.max(0, Math.round(args.messageCount))
  const fillRatio = Math.min(1, used / capacity)
  return {
    used,
    capacity,
    atCapacity: used >= capacity,
    overCapacity: used > capacity,
    fillRatio,
  }
}
