import { describe, expect, it } from 'vitest'
import { createFakeIpcChannel } from './fake-ipc-channel'
import { createAgentStreamDriver } from './agent-stream-driver'

const base = {
  conversationId: 'conv-driver',
  assistantId: 'assistant-driver',
}

describe('createAgentStreamDriver', () => {
  it('emits UI, string, and finished stream events', () => {
    const ipc = createFakeIpcChannel()
    const uiChunks: unknown[] = []
    const stringChunks: unknown[] = []
    const finished: unknown[] = []
    const storeChanged: unknown[] = []

    ipc.AgentUIMessageChunk.on((_event, payload) => {
      uiChunks.push(payload)
    })
    ipc.AgentStreamChunk.on((_event, payload) => {
      stringChunks.push(payload)
    })
    ipc.AgentStreamFinished.on((_event, payload) => {
      finished.push(payload)
    })
    ipc.ConversationStoreChanged.on((_event, payload) => {
      storeChanged.push(payload)
    })

    const driver = createAgentStreamDriver(ipc, base)
    driver.pushTextDelta('Hello', 'text-a')
    driver.pushLegacyString('legacy')
    driver.emitConversationStoreChanged('conv-driver')
    driver.finish()

    expect(uiChunks).toEqual([
      {
        ...base,
        chunk: { type: 'text-delta', id: 'text-a', delta: 'Hello' },
      },
    ])
    expect(stringChunks).toEqual([{ ...base, chunk: 'legacy' }])
    expect(storeChanged).toEqual([{ conversationId: 'conv-driver' }])
    expect(finished).toEqual([base])
  })

  it('allows pushing custom chunk payloads', () => {
    const ipc = createFakeIpcChannel()
    const received: unknown[] = []
    ipc.AgentUIMessageChunk.on((_event, payload) => {
      received.push(payload)
    })

    const driver = createAgentStreamDriver(ipc, base)
    const custom = {
      ...base,
      chunk: { type: 'tool-input-available', toolCallId: 't1' },
    }
    driver.pushUiChunk(custom)

    expect(received).toEqual([custom])
  })
})
