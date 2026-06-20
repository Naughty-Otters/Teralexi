import { describe, expect, it } from 'vitest'
import { convertToModelMessages } from 'ai'
import type { ClientUiMessage } from './client-ui-parse'
import {
  buildAgentModelMessages,
  sliceClientUiMessagesForToolApprovalContinuation,
} from './client-ui-messages'

function userMsg(parts: ClientUiMessage['parts'], id = 'u1'): ClientUiMessage {
  return { id, role: 'user', parts }
}

function assistantMsg(parts: ClientUiMessage['parts'], id = 'a1'): ClientUiMessage {
  return { id, role: 'assistant', parts }
}

describe('tool approval resume model messages', () => {
  it('sliced single-todo thread avoids stale tools in assistant content', async () => {
    const clientUi: ClientUiMessage[] = [
      userMsg([{ type: 'text', text: 'run tools' }]),
      assistantMsg([
        { type: 'text', text: 'working' },
        {
          type: 'dynamic-tool',
          toolName: 'done_tool',
          toolCallId: 'tc1',
          state: 'output-available',
          input: {},
          output: 'done',
        },
        { type: 'text', text: 'now the risky one' },
        {
          type: 'dynamic-tool',
          toolName: 'risky_tool',
          toolCallId: 'tc2',
          state: 'approval-responded',
          input: { path: '/tmp' },
          approval: { id: 'ap2', approved: true },
        },
      ]),
    ]

    const sliced = sliceClientUiMessagesForToolApprovalContinuation(clientUi, {
      multiTodoPlan: false,
    })
    const messages = await buildAgentModelMessages({
      toolSet: {},
      fallbackUserContent: 'step prompt',
      clientUiMessages: sliced,
    })

    const assistant = messages.find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()
    expect(Array.isArray(assistant!.content)).toBe(true)
    const parts = assistant!.content as Array<{ type?: string; toolCallId?: string }>
    const toolCalls = parts.filter((p) => p.type === 'tool-call')
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]?.toolCallId).toBe('tc2')
    expect(parts.some((p) => p.type === 'text')).toBe(false)

    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    const toolParts = toolMsg!.content as Array<{ type?: string; toolCallId?: string }>
    expect(toolParts.some((p) => p.type === 'tool-result' && p.toolCallId === 'tc1')).toBe(
      false,
    )
    expect(toolParts.some((p) => p.type === 'tool-approval-response')).toBe(true)
  })

  it('unsliced full assistant would include stale tool calls (regression guard)', async () => {
    const clientUi: ClientUiMessage[] = [
      userMsg([{ type: 'text', text: 'run tools' }]),
      assistantMsg([
        { type: 'text', text: 'working' },
        {
          type: 'dynamic-tool',
          toolName: 'done_tool',
          toolCallId: 'tc1',
          state: 'output-available',
          input: {},
          output: 'done',
        },
        {
          type: 'dynamic-tool',
          toolName: 'risky_tool',
          toolCallId: 'tc2',
          state: 'approval-responded',
          input: { path: '/tmp' },
          approval: { id: 'ap2', approved: true },
        },
      ]),
    ]

    const unsliced = await convertToModelMessages(clientUi, {
      ignoreIncompleteToolCalls: true,
      tools: {},
    })
    const assistant = unsliced.find((m) => m.role === 'assistant')
    const parts = assistant!.content as Array<{ type?: string; toolCallId?: string }>
    expect(parts.filter((p) => p.type === 'tool-call')).toHaveLength(2)
  })
})
