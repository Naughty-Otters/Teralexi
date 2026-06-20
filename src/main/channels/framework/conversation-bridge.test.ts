import { describe, expect, it, vi } from 'vitest'

const saveMessage = vi.fn()
const createConversation = vi.fn()
const getConversation = vi.fn(() => null)

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversation,
    createConversation,
    saveMessage,
  })),
}))

vi.mock('@main/services/web-content-send', () => ({
  webContentSend: new Proxy({}, { get: () => vi.fn() }),
}))

vi.mock('@main/workflows/workflow-dispatcher', () => ({
  getWorkflowDispatcher: vi.fn(() => ({
    tryDispatchChannelMessage: vi.fn(async () => ({ dispatched: false })),
  })),
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: vi.fn(() => ({ get: vi.fn(() => null) })),
}))

vi.mock('@main/engine', () => ({
  runAgentForConversation: vi.fn(async () => ({
    finalContent: 'ok',
    hasError: false,
  })),
}))

vi.mock('@main/agent/context', () => ({
  serializeAssistantMessageForHistory: (s: string) => s,
}))

import { getChannelConversationBridge } from './conversation-bridge'

describe('conversation-bridge', () => {
  it('creates conversation and saves user message on inbound', async () => {
    const bridge = getChannelConversationBridge()
    expect(() =>
      bridge.onIncomingMessage({
      channelId: 'whatsapp',
      senderId: 'user-1',
      senderTarget: '+1',
      text: 'Hello channel',
      occurredAtIso: '2026-01-01T00:00:00.000Z',
      agentId: 'skill:demo',
      }),
    ).not.toThrow()
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'channel:whatsapp:user-1',
        agentId: 'skill:demo',
      }),
    )
    expect(saveMessage).toHaveBeenCalled()
  })
})
