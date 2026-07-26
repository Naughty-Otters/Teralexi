/**
 * Chat UI performance helpers.
 *
 * Counters work in DEV / stress mode. Timeline marks are opt-in so clean Perf
 * traces are not dominated by `performance.mark` itself.
 *
 * Enable marks: `localStorage.setItem('teralexi.chatUiPerfMarks', '1')` then reload,
 * or call {@link setChatUiPerfMarksEnabled}(true).
 */

let stressMode = false
let marksOptIn = readMarksOptIn()

const DEV_ENABLED =
  typeof import.meta !== 'undefined' &&
  Boolean(import.meta.env?.DEV) &&
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function'

function readMarksOptIn(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem('teralexi.chatUiPerfMarks') === '1'
  } catch {
    return false
  }
}

function countersEnabled(): boolean {
  return DEV_ENABLED || stressMode
}

function marksEnabled(): boolean {
  return (
    marksOptIn &&
    countersEnabled() &&
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

/** Opt into noisy timeline marks (normalize/snapshot/ipc). Off by default. */
export function setChatUiPerfMarksEnabled(enabled: boolean): void {
  marksOptIn = enabled
  try {
    if (typeof localStorage === 'undefined') return
    if (enabled) localStorage.setItem('teralexi.chatUiPerfMarks', '1')
    else localStorage.removeItem('teralexi.chatUiPerfMarks')
  } catch {
    // Ignore quota / private mode.
  }
}

export function isChatUiPerfMarksEnabled(): boolean {
  return marksOptIn
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
    performance.measure(
      `chat:${name}`,
      `chat:${startMark}`,
      endMark ?? `chat:${name}:end`,
    )
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
  if (!countersEnabled()) return
  ingressChunkCount++
  chatUiPerfMark('ipc.chunk.received')
}

export function recordUiFlush(): void {
  if (!countersEnabled()) return
  uiFlushCount++
}

export function getChatUiPerfCounters(): {
  ingressChunks: number
  uiFlushes: number
} {
  return { ingressChunks: ingressChunkCount, uiFlushes: uiFlushCount }
}
