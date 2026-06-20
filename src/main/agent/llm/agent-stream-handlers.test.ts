import { describe, expect, it, vi } from 'vitest'
import { createDefaultLlmEventHandlerRegistry } from './handlers/registry'
import { LlmProcessor } from './processor'
import { createLlmProcessorState } from './handlers/types'
import { TextDeltaHandler } from './handlers/text-delta-handler'
import { ToolApprovalRequestHandler } from './handlers/tool-approval-request-handler'
import { ToolCallHandler } from './handlers/tool-call-handler'
import { ToolResultHandler } from './handlers/tool-result-handler'
import { ToolErrorHandler } from './handlers/tool-error-handler'
import { ToolOutputDeniedHandler } from './handlers/tool-output-denied-handler'

function handlerCtx(overrides: {
  onChunk?: ReturnType<typeof vi.fn>
  onUIMessageChunk?: ReturnType<typeof vi.fn>
} = {}) {
  const onChunk = overrides.onChunk ?? vi.fn()
  const onUIMessageChunk = overrides.onUIMessageChunk ?? vi.fn()
  const processor = new LlmProcessor(createLlmProcessorState())
  const run = { mode: 'progress' as const, onChunk, onUIMessageChunk }
  return { processor, run, onChunk, onUIMessageChunk }
}

describe('agent stream LlmProcessor handlers', () => {
  it('TextDeltaHandler streams text without onUIMessageChunk', () => {
    const { processor, run, onChunk, onUIMessageChunk } = handlerCtx()
    new TextDeltaHandler().handle(
      { type: 'text-delta', id: 't1', text: 'hello' },
      { state: processor.state, run },
    )
    expect(processor.state.text).toBe('hello')
    expect(onChunk).toHaveBeenCalledWith('hello')
    expect(onUIMessageChunk).not.toHaveBeenCalled()
  })

  it('ToolApprovalRequestHandler tracks pending approval and forwards UI chunk', () => {
    const { processor, run, onUIMessageChunk } = handlerCtx()
    const payload = {
      type: 'tool-approval-request',
      toolCallId: 'call-1',
      approvalId: 'appr-1',
    }
    new ToolApprovalRequestHandler().handle(
      {
        type: 'tool-approval-request',
        toolCallId: 'call-1',
        approvalId: 'appr-1',
        payload,
      },
      { state: processor.state, run },
    )
    expect(processor.state.pendingApprovals.has('call-1')).toBe(true)
    expect(processor.state.pendingApprovals.has('approval:appr-1')).toBe(true)
    expect(onUIMessageChunk).toHaveBeenCalledWith(payload)
  })

  it('ToolCallHandler emits tool-input-available UI chunk', () => {
    const { processor, run, onUIMessageChunk } = handlerCtx()
    new ToolCallHandler().handle(
      { type: 'tool-call', id: 'c1', name: 'read_file', input: { path: 'a.ts' } },
      { state: processor.state, run },
    )
    expect(onUIMessageChunk).toHaveBeenCalledWith({
      type: 'tool-input-available',
      toolCallId: 'c1',
      toolName: 'read_file',
      input: { path: 'a.ts' },
    })
  })

  it('ToolResultHandler appends transcript and emits tool-output-available', () => {
    const { processor, run, onChunk, onUIMessageChunk } = handlerCtx()
    new ToolResultHandler().handle(
      {
        type: 'tool-result',
        id: 'c1',
        name: 'run_script',
        result: {
          success: true,
          resultType: 'terminal',
          resultContent: '--- stdout ---\nok',
        },
      },
      { state: processor.state, run },
    )
    expect(processor.state.text).toContain('**Terminal**')
    expect(processor.state.text).toContain('ok')
    expect(onChunk).toHaveBeenCalled()
    expect(onUIMessageChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-output-available',
        toolCallId: 'c1',
      }),
    )
  })

  it('ToolErrorHandler appends error block and emits tool-output-error', () => {
    const { processor, run, onChunk, onUIMessageChunk } = handlerCtx()
    new ToolErrorHandler().handle(
      {
        type: 'tool-error',
        id: 'c2',
        name: 'grep_files',
        message: 'failed',
      },
      { state: processor.state, run },
    )
    expect(processor.state.text).toContain('failed')
    expect(onChunk).toHaveBeenCalled()
    expect(onUIMessageChunk).toHaveBeenCalledWith({
      type: 'tool-output-error',
      toolCallId: 'c2',
      toolName: 'grep_files',
      errorText: 'failed',
    })
  })

  it('ToolOutputDeniedHandler forwards denied chunk', () => {
    const { processor, run, onUIMessageChunk } = handlerCtx()
    const payload = { type: 'tool-output-denied', toolCallId: 'c3' }
    new ToolOutputDeniedHandler().handle(
      { type: 'tool-output-denied', toolCallId: 'c3', payload },
      { state: processor.state, run },
    )
    expect(onUIMessageChunk).toHaveBeenCalledWith(payload)
  })

  it('default registry includes HITL handlers', () => {
    const registry = createDefaultLlmEventHandlerRegistry()
    expect(registry.has('tool-approval-request')).toBe(true)
    expect(registry.has('tool-output-denied')).toBe(true)
  })
})
