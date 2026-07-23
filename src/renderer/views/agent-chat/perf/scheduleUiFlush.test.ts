import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  conversationIsCatchingUp,
  flushAllUiForConversation,
  namespacedFlushKey,
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

  it('coalesces normal flushes to one run per namespaced key per frame', () => {
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

  it('keeps concurrent conversations from overwriting each other', () => {
    const fnA = vi.fn()
    const fnB = vi.fn()
    setVisibleConversationForUiFlush(null)

    scheduleUiFlush('messages-sync', fnA, {
      conversationId: 'conv-a',
      priority: 'normal',
    })
    scheduleUiFlush('messages-sync', fnB, {
      conversationId: 'conv-b',
      priority: 'normal',
    })
    ;(globalThis as { __flushRaf?: () => void }).__flushRaf?.()

    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).toHaveBeenCalledTimes(1)
    expect(namespacedFlushKey('messages-sync', 'conv-a')).toBe(
      'conv-a::messages-sync',
    )
    expect(namespacedFlushKey('messages-sync', 'conv-b')).toBe(
      'conv-b::messages-sync',
    )
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

  it('flushAllUiForConversation only runs that conversation’s pending jobs', () => {
    const fnA = vi.fn()
    const fnB = vi.fn()
    scheduleUiFlush('messages-sync', fnA, {
      conversationId: 'conv-a',
      priority: 'normal',
    })
    scheduleUiFlush('messages-sync', fnB, {
      conversationId: 'conv-b',
      priority: 'normal',
    })

    flushAllUiForConversation('conv-a')
    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).not.toHaveBeenCalled()

    flushAllUiForConversation('conv-b')
    expect(fnB).toHaveBeenCalledTimes(1)
  })

  it('sets catching up when ingress backlog exceeds threshold', () => {
    for (let i = 0; i < 101; i++) {
      recordIngressChunkForBackpressure('conv-1')
    }
    expect(conversationIsCatchingUp('conv-1').value).toBe(true)
  })
})
