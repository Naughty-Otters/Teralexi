import { describe, expect, it, vi } from 'vitest'
import { TextDeltaHandler } from './text-delta-handler'
import { ToolCallHandler } from './tool-call-handler'
import { ToolApprovalRequestHandler } from './tool-approval-request-handler'
import { ToolOutputDeniedHandler } from './tool-output-denied-handler'
import { createDefaultLlmEventHandlerRegistry } from './registry'
import { createLlmProcessorState } from './types'

describe('LlmEventHandler classes', () => {
  it('TextDeltaHandler updates state and publishes', () => {
    const handler = new TextDeltaHandler()
    const state = createLlmProcessorState()
    const onChunk = vi.fn()
    handler.handle(
      { type: 'text-delta', id: 't0', text: 'hi' },
      { state, run: { mode: 'progress', onChunk } },
    )
    expect(state.text).toBe('hi')
    expect(onChunk).toHaveBeenCalledWith('hi')
    expect(handler.eventType).toBe('text-delta')
  })

  it('TextDeltaHandler prefers emitStepProgress over onChunk when both are set', () => {
    const handler = new TextDeltaHandler()
    const state = createLlmProcessorState()
    const onChunk = vi.fn()
    const emitStepProgress = vi.fn()
    handler.handle(
      { type: 'text-delta', id: 't0', text: 'hi' },
      { state, run: { mode: 'progress', onChunk, emitStepProgress } },
    )
    expect(emitStepProgress).toHaveBeenCalledWith('hi')
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('ToolCallHandler tracks running tool parts', () => {
    const handler = new ToolCallHandler()
    const state = createLlmProcessorState()
    handler.handle(
      { type: 'tool-call', id: 'c1', name: 'search', input: { query: 'foo' } },
      { state, run: { mode: 'silent' } },
    )
    expect(state.toolParts.get('c1')).toEqual({
      name: 'search',
      status: 'running',
      input: { query: 'foo' },
    })
  })

  it('registry maps one handler per event type', () => {
    const registry = createDefaultLlmEventHandlerRegistry()
    expect(registry.get('text-delta')).toBeInstanceOf(TextDeltaHandler)
    expect(registry.get('tool-call')).toBeInstanceOf(ToolCallHandler)
    expect(registry.get('tool-approval-request')).toBeInstanceOf(
      ToolApprovalRequestHandler,
    )
    expect(registry.get('tool-output-denied')).toBeInstanceOf(
      ToolOutputDeniedHandler,
    )
    expect(registry.size).toBe(16)
  })
})
