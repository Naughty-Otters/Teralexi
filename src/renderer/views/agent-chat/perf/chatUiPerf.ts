/** Dev-only performance marks for chat UI hot paths — also active during stress runs. */

let stressMode = false

const DEV_ENABLED =
  typeof import.meta !== 'undefined' &&
  Boolean(import.meta.env?.DEV) &&
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function'

function marksEnabled(): boolean {
  return (
    (DEV_ENABLED || stressMode) &&
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function'
  )
}

/** Enable chat UI counters outside DEV while a stress soak is running. */
export function setChatUiPerfStressMode(enabled: boolean): void {
  stressMode = enabled
}

export function isChatUiPerfStressMode(): boolean {
  return stressMode
}

export function chatUiPerfMark(name: string): void {
  if (!marksEnabled()) return
  performance.mark(`chat:${name}`)
}

export function chatUiPerfMeasure(
  name: string,
  startMark: string,
  endMark?: string,
): void {
  if (!marksEnabled()) return
  try {
    performance.measure(`chat:${name}`, `chat:${startMark}`, endMark ?? `chat:${name}:end`)
  } catch {
    // Marks may be missing when a path short-circuits.
  }
}

export function chatUiPerfMarkEnd(name: string): void {
  chatUiPerfMark(`${name}:end`)
  chatUiPerfMeasure(name, name)
}

/** Stress-harness counters (dev / stress runs). */
let ingressChunkCount = 0
let uiFlushCount = 0

export function resetChatUiPerfCounters(): void {
  ingressChunkCount = 0
  uiFlushCount = 0
}

export function recordIngressChunk(): void {
  ingressChunkCount++
  chatUiPerfMark('ipc.chunk.received')
}

export function recordUiFlush(): void {
  uiFlushCount++
}

export function getChatUiPerfCounters(): {
  ingressChunks: number
  uiFlushes: number
} {
  return { ingressChunks: ingressChunkCount, uiFlushes: uiFlushCount }
}
