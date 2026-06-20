import { describe, expect, it, vi } from 'vitest'

vi.mock('toad-scheduler', () => ({
  ToadScheduler: class MockToadScheduler {
    stop = vi.fn()
    removeById = vi.fn()
    addSimpleIntervalJob = vi.fn()
    addCronJob = vi.fn()
  },
  SimpleIntervalJob: vi.fn(),
  CronJob: vi.fn(),
  AsyncTask: vi.fn().mockImplementation((_id, fn) => ({ fn })),
}))

vi.mock('./conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    listSchedulers: vi.fn(() => []),
  })),
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: vi.fn(() => ({ get: vi.fn(() => null) })),
}))

vi.mock('@main/engine', () => ({
  runAgentForConversation: vi.fn(),
}))

import { getSchedulerManager } from './scheduler-manager'

describe('scheduler-manager', () => {
  it('singleton starts once', () => {
    const a = getSchedulerManager()
    const b = getSchedulerManager()
    expect(a).toBe(b)
    a.ensureStarted()
    a.stop()
  })
})
