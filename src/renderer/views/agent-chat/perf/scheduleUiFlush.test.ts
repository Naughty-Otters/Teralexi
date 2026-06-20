import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  conversationIsCatchingUp,
  recordIngressChunkForBackpressure,
  resetChatUiFlushState,
  scheduleUiFlush,
  setChatUiFlushSchedulers,
  setVisibleConversationForUiFlush,
} from './scheduleUiFlush'
import { getChatUiPerfCounters, resetChatUiPerfCounters } from './chatUiPerf'

describe('scheduleUiFlush', () => {
  beforeEach(() => {
    resetChatUiFlushState()
    resetChatUiPerfCounters()
    setVisibleConversationForUiFlush('conv-1')
    const rafQueue: FrameRequestCallback[] = []
    setChatUiFlushSchedulers({
      raf: (cb) => {
        rafQueue.push(cb)
        return rafQueue.length
      },
      microtask: (cb) => cb(),
    })
    ;(globalThis as { __flushRaf?: () => void }).__flushRaf = () => {
      const jobs = [...rafQueue]
      rafQueue.length = 0
      for (const job of jobs) job(0)
    }
  })

  it('coalesces normal flushes to one run per key per frame', () => {
    const fn = vi.fn()
    scheduleUiFlush('scroll', fn, {
      conversationId: 'conv-1',
      priority: 'normal',
    })
    scheduleUiFlush('scroll', fn, {
      conversationId: 'conv-1',
      priority: 'normal',
    })
    ;(globalThis as { __flushRaf?: () => void }).__flushRaf?.()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getChatUiPerfCounters().uiFlushes).toBe(1)
  })

  it('runs immediate flushes without waiting for rAF', () => {
    const fn = vi.fn()
    scheduleUiFlush('snapshot', fn, {
      conversationId: 'conv-1',
      priority: 'immediate',
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('skips normal flushes for non-visible conversations', () => {
    const fn = vi.fn()
    scheduleUiFlush('scroll', fn, {
      conversationId: 'conv-bg',
      priority: 'normal',
    })
    ;(globalThis as { __flushRaf?: () => void }).__flushRaf?.()
    expect(fn).not.toHaveBeenCalled()
  })

  it('sets catching up when ingress backlog exceeds threshold', () => {
    for (let i = 0; i < 101; i++) {
      recordIngressChunkForBackpressure('conv-1')
    }
    expect(conversationIsCatchingUp('conv-1').value).toBe(true)
  })
})
