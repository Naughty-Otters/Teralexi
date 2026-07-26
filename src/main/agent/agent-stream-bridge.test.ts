import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createAgentStreamBridge } from '@main/agent/agent-stream-bridge'
import { webContentSend } from '@main/services/web-content-send'

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    AgentStreamChunk: vi.fn(),
    AgentUIMessageChunk: vi.fn(),
    AgentStreamFinished: vi.fn(),
    AgentSandboxOutput: vi.fn(),
  },
}))

describe('createAgentStreamBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns handlers that no-op without webContents', () => {
    const onSandboxPersist = vi.fn()
    const bridge = createAgentStreamBridge({
      conversationId: 'c1',
      assistantMessageId: 'a1',
      onSandboxPersist,
    })
    expect(() => bridge.onChunk('hi')).not.toThrow()
    bridge.onSandboxReady({
      conversationId: 'c1',
      sandboxRoot: '/s',
      outputResultsDir: '/s/out',
      resultsFileUrl: 'file:///s/out',
    })
    expect(onSandboxPersist).toHaveBeenCalled()
  })

  it('coalesces text stream chunks and flushes on finish', () => {
    const webContents = { isDestroyed: () => false } as never
    const bridge = createAgentStreamBridge({
      webContents,
      conversationId: 'c1',
      assistantMessageId: 'a1',
      onSandboxPersist: vi.fn(),
      textChunkCoalesceMs: 32,
    })

    bridge.onChunk('hel')
    bridge.onChunk('lo')
    expect(webContentSend.AgentStreamChunk).not.toHaveBeenCalled()

    vi.advanceTimersByTime(32)
    expect(webContentSend.AgentStreamChunk).toHaveBeenCalledTimes(1)
    expect(webContentSend.AgentStreamChunk).toHaveBeenCalledWith(webContents, {
      conversationId: 'c1',
      assistantId: 'a1',
      chunk: 'hello',
    })

    bridge.onChunk('!')
    bridge.notifyFinished()
    expect(webContentSend.AgentStreamChunk).toHaveBeenCalledWith(webContents, {
      conversationId: 'c1',
      assistantId: 'a1',
      chunk: '!',
    })
    expect(webContentSend.AgentStreamFinished).toHaveBeenCalled()
  })
})
