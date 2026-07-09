import { describe, expect, it } from 'vitest'
import {
  collectFormRequestChunk,
  legacyStringChunk,
  streamFinishedPayload,
  textDeltaChunk,
  textEndChunk,
  textStartChunk,
  toolApprovalRequestChunk,
  type AgentStreamPayload,
} from './stream-fixtures'

const base: AgentStreamPayload = {
  conversationId: 'conv-1',
  assistantId: 'assistant-1',
}

describe('stream-fixtures', () => {
  it('builds text stream chunks with shared ids', () => {
    expect(textStartChunk(base, 'text-a')).toEqual({
      ...base,
      chunk: { type: 'text-start', id: 'text-a' },
    })
    expect(textDeltaChunk(base, 'Hello', 'text-a')).toEqual({
      ...base,
      chunk: { type: 'text-delta', id: 'text-a', delta: 'Hello' },
    })
    expect(textEndChunk(base, 'text-a')).toEqual({
      ...base,
      chunk: { type: 'text-end', id: 'text-a' },
    })
  })

  it('uses default text part id', () => {
    expect(textDeltaChunk(base, 'Hi').chunk).toEqual({
      type: 'text-delta',
      id: 'text-main',
      delta: 'Hi',
    })
  })

  it('builds tool approval request chunks', () => {
    expect(toolApprovalRequestChunk(base)).toEqual({
      ...base,
      chunk: {
        type: 'tool-approval-request',
        approvalId: 'approval-1',
        toolCallId: 'tool-call-1',
        toolName: 'read_file',
        input: { path: 'README.md' },
      },
    })
    expect(
      toolApprovalRequestChunk(base, {
        approvalId: 'a-2',
        toolName: 'write_file',
      }).chunk,
    ).toMatchObject({
      approvalId: 'a-2',
      toolName: 'write_file',
    })
  })

  it('builds collect-form request chunks', () => {
    const chunk = collectFormRequestChunk(base, {
      requestId: 'form-9',
      title: 'Details',
      fields: [{ key: 'name', label: 'Name', type: 'text' }],
    })
    expect(chunk.chunk).toMatchObject({
      type: 'data-collect-form-request',
      id: 'form-9',
      data: {
        title: 'Details',
        fields: [{ key: 'name', label: 'Name', type: 'text' }],
      },
    })
  })

  it('builds legacy string and finished payloads', () => {
    expect(legacyStringChunk(base, 'partial')).toEqual({
      ...base,
      chunk: 'partial',
    })
    expect(streamFinishedPayload(base)).toEqual(base)
  })
})
