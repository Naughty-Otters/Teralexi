import {
  getChatUiPerfCounters,
  recordIngressChunk,
  resetChatUiPerfCounters,
} from './chatUiPerf'
import { recordIngressChunkForBackpressure } from './scheduleUiFlush'

export type StressChunkHandler = (chunk: {
  type: 'text-delta'
  delta: string
}) => void | Promise<void>

/**
 * Dev harness: fire synthetic text-delta bursts and report ingress vs UI flush ratio.
 */
export async function runChatStreamStressHarness(opts: {
  conversationId: string
  chunkCount: number
  onChunk: StressChunkHandler
  batchSize?: number
}): Promise<{
  chunkCount: number
  ingressChunks: number
  uiFlushes: number
}> {
  const { conversationId, chunkCount, onChunk, batchSize = 50 } = opts
  resetChatUiPerfCounters()

  for (let i = 0; i < chunkCount; i++) {
    recordIngressChunk()
    recordIngressChunkForBackpressure(conversationId)
    await onChunk({ type: 'text-delta', delta: `d${i} ` })
    if (i > 0 && i % batchSize === 0) {
      await Promise.resolve()
    }
  }

  const counters = getChatUiPerfCounters()
  return {
    chunkCount,
    ingressChunks: counters.ingressChunks,
    uiFlushes: counters.uiFlushes,
  }
}
