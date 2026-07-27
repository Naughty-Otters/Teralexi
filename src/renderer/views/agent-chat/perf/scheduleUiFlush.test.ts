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
  const rafQueue: FrameRequestCallback[] = []
  const timeoutQueue: Array<{ cb: () => void; ms: number }> = []
  let now = 0

  function flushRaf(): void {
    const jobs = [...rafQueue]
    rafQueue.length = 0
    for (const job of jobs) job(now)
  }

  function flushTimeouts(): void {
    const jobs = [...timeoutQueue]
    timeoutQueue.length = 0
    for (const job of jobs) {
      now += job.ms
      job.cb()
    }
  }

  beforeEach(() => {
    resetChatUiFlushState()
    resetChatUiPerfCounters()
    setVisibleConversationForUiFlush('conv-1')
    rafQueue.length = 0
    timeoutQueue.length = 0
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    setChatUiFlushSchedulers({
      raf: (cb) => {
        rafQueue.push(cb)
        return rafQueue.length
      },
      cancelRaf: () => {
        rafQueue.length = 0
      },
      timeout: (cb, ms) => {
        timeoutQueue.push({ cb, ms })
        return timeoutQueue.length
      },
      clearTimeout: () => {
        timeoutQueue.length = 0
      },
      microtask: (cb) => cb(),
    })
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
    flushRaf()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getChatUiPerfCounters().uiFlushes).toBe(1)
  })

  it('waits with timeout instead of empty rAF when inside min interval', () => {
    const fn = vi.fn()
    scheduleUiFlush('messages-sync', fn, {
      conversationId: 'conv-1',
      priority: 'normal',
    })
    flushRaf()
    expect(fn).toHaveBeenCalledTimes(1)

    scheduleUiFlush('messages-sync', fn, {
      conversationId: 'conv-1',
      priority: 'normal',
    })
    // Still inside 32ms window — should schedule timeout, not another empty rAF spin.
    expect(rafQueue).toHaveLength(0)
    expect(timeoutQueue.length).toBeGreaterThan(0)
    expect(fn).toHaveBeenCalledTimes(1)

    flushTimeouts()
    flushRaf()
    expect(fn).toHaveBeenCalledTimes(2)
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
    flushRaf()

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
    flushRaf()
    expect(fn).not.toHaveBeenCalled()
  })

  it('allows flushes for all conversations in the visible set', async () => {
    const { setVisibleConversationIdsForUiFlush } = await import('./scheduleUiFlush')
    setVisibleConversationIdsForUiFlush(['conv-1', 'conv-2'], 'conv-1')
    const fn = vi.fn()
    scheduleUiFlush('scroll', fn, {
      conversationId: 'conv-2',
      priority: 'normal',
    })
    flushRaf()
    expect(fn).toHaveBeenCalledTimes(1)
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
