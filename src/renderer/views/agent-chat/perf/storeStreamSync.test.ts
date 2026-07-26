import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  flushStoreStreamSync,
  flushStoreStreamSyncForConversation,
  initStoreStreamSync,
  queueStoreStepProgress,
  queueStoreTextDelta,
  resetStoreStreamSync,
} from './storeStreamSync'
import {
  resetChatUiFlushState,
  setVisibleConversationForUiFlush,
  setChatUiFlushSchedulers,
} from './scheduleUiFlush'

type StoreMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
}

describe('storeStreamSync background coalesce', () => {
  let conversations: Record<string, StoreMessage[]>
  let visibleId: string | null

  beforeEach(() => {
    resetStoreStreamSync()
    resetChatUiFlushState()
    visibleId = 'conv-visible'
    conversations = {
      'conv-visible': [
        { id: 'a-vis', role: 'assistant', content: '', isStreaming: true },
      ],
      'conv-bg': [
        { id: 'a-bg', role: 'assistant', content: '', isStreaming: true },
      ],
    }
    initStoreStreamSync({
      getVisibleConversationId: () => visibleId,
      getConversations: () => conversations,
    })
    setVisibleConversationForUiFlush(visibleId)
    setChatUiFlushSchedulers({
      raf: (cb) => {
        cb(0)
        return 1
      },
      microtask: (cb) => cb(),
    })
  })

  afterEach(() => {
    resetStoreStreamSync()
    resetChatUiFlushState()
  })

  it('does not apply background text deltas until flush for that conversation', () => {
    queueStoreTextDelta('conv-bg', 'a-bg', 'hello')
    queueStoreTextDelta('conv-bg', 'a-bg', ' world')
    expect(conversations['conv-bg'][0].content).toBe('')

    flushStoreStreamSyncForConversation('conv-bg')
    expect(conversations['conv-bg'][0].content).toBe('hello world')
  })

  it('still coalesces visible deltas via scheduleUiFlush', () => {
    queueStoreTextDelta('conv-visible', 'a-vis', 'A')
    queueStoreTextDelta('conv-visible', 'a-vis', 'B')
    // raf stub runs immediately in beforeEach scheduler — flush runs on schedule
    flushStoreStreamSync()
    expect(conversations['conv-visible'][0].content).toBe('AB')
  })

  it('coalesces background step progress until activate flush', () => {
    queueStoreStepProgress('conv-bg', 'a-bg', 'step-1')
    queueStoreStepProgress('conv-bg', 'a-bg', 'step-2')
    expect(conversations['conv-bg'][0].content).toBe('')

    flushStoreStreamSyncForConversation('conv-bg')
    expect(conversations['conv-bg'][0].content).toBe('step-2')
  })
})
