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

describe('form-submit resume model messages', () => {
  it('trailing step prompt drops incomplete approvals so OpenAI pairing stays valid', async () => {
    const clientUi: ClientUiMessage[] = [
      userMsg([{ type: 'text', text: 'build the site' }]),
      assistantMsg([
        { type: 'text', text: 'Need a few details' },
        {
          type: 'dynamic-tool',
          toolName: 'write_file',
          toolCallId: 'tc-done',
          state: 'output-available',
          input: { path: 'index.html' },
          output: 'ok',
        },
        {
          type: 'dynamic-tool',
          toolName: 'publish_website',
          toolCallId: 'tc-pending',
          state: 'approval-responded',
          input: {},
          approval: { id: 'ap-pub', approved: true },
        },
        {
          type: 'dynamic-tool',
          toolName: 'enter_plan_mode',
          toolCallId: 'tc-plan',
          state: 'approval-requested',
          input: {},
        },
        {
          type: 'data-collect-form-request',
          id: 'form-1',
          data: { todoId: 1, todoName: 'Site details' },
        },
      ]),
      userMsg([
        {
          type: 'data-collect-form-response',
          id: 'form-1',
          data: { values: { title: 'Otters' } },
        },
      ]),
    ]

    // Mirrors buildLoopMessagesForFormSubmitResume:
    // full UI replay + trailing executor step prompt.
    const messages = await buildAgentModelMessages({
      toolSet: {},
      fallbackUserContent: 'Execute with the submitted form values.',
      clientUiMessages: clientUi,
      trailingUserContent: 'Execute with the submitted form values.',
    })

    expect(messages.at(-1)?.role).toBe('user')
    expect(String(messages.at(-1)?.content)).toContain('submitted form')

    const serialized = JSON.stringify(messages)
    expect(serialized).not.toContain('tc-pending')
    expect(serialized).not.toContain('tc-plan')
    expect(serialized).toContain('tc-done')

    const unanswered = messages.some((msg) => {
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return false
      return msg.content.some(
        (part) =>
          part &&
          typeof part === 'object' &&
          (part as { type?: string }).type === 'tool-call' &&
          (part as { toolCallId?: string }).toolCallId === 'tc-pending',
      )
    })
    expect(unanswered).toBe(false)
  })
})
