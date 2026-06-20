import { describe, expect, it, vi } from 'vitest'
import { createAgentStreamBridge } from '@main/agent/agent-stream-bridge'

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: {
    AgentStreamChunk: vi.fn(),
    AgentUIMessageChunk: vi.fn(),
    AgentFinished: vi.fn(),
  },
}))

describe('createAgentStreamBridge', () => {
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
})
